import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { mapValues, omit } from 'lodash'
import { Contract } from 'common/contract'
import { NewsFeedbackKind, NewsMarketRelation } from 'common/news-feed'
import { MINUTE_MS } from 'common/util/time'
import { log } from 'shared/utils'
import { getTollbitSpend, setTollbitSpend, TollbitSpend } from './articles'
import { buildNewsFeed, NewsFeedBuild, sanitizeForConfig } from './pipeline'

/**
 * One build of the feed per process, refreshed on a timer, plus what readers
 * add to it: likes, markets they attach to stories and claims, and reports
 * about matches. All of it is cached on disk (minus embeddings) so a restart
 * serves the last feed at once instead of spending minutes and a few cents
 * rebuilding it.
 *
 * Prototype scope: in-process state, no DB writes. The design doc moves this
 * to tables and a scheduler job.
 */

export const isNewsFeedEnabled = () => process.env.NEWS_FEED_ENABLED === 'true'

export const NEWS_FEED_REFRESH_MS = 10 * MINUTE_MS
/** A cached build older than this is ignored on startup. */
const CACHE_MAX_AGE_MS = 24 * 60 * MINUTE_MS
/** A refresh still "running" after this long is assumed wedged. */
const REFRESH_BUDGET_MS = 25 * MINUTE_MS
const SAVE_DEBOUNCE_MS = 2_000
const MAX_FEEDBACK = 5_000

/** Story id to the ids of the users who liked it. */
type Likes = Record<string, string[]>

/** A market a reader linked to a story: as the direct test of one of its
 * claims, or as a related forecast. */
export type NewsAttachment = {
  storyId: string
  claimId?: string
  contractId: string
  relation: NewsMarketRelation
  userId: string
  time: number
}

/** A reader's report that a market shown on a story is wrong for it. */
export type NewsFeedbackEntry = {
  storyId: string
  contractId?: string
  claimId?: string
  kind: NewsFeedbackKind
  suggestedContractId?: string
  note?: string
  userId?: string
  time: number
}

type CacheFile = NewsFeedBuild & {
  likes?: Likes
  attachments?: NewsAttachment[]
  attachedContracts?: Record<string, Contract>
  feedback?: NewsFeedbackEntry[]
  /** Today's paid reads, so a restart does not reset the budget. */
  tollbitSpend?: TollbitSpend
}

type State = {
  build?: NewsFeedBuild
  likes: Likes
  attachments: NewsAttachment[]
  /** Contracts readers attached, so they show before the next build loads
   * them. */
  attachedContracts: Record<string, Contract>
  feedback: NewsFeedbackEntry[]
  refreshing: boolean
  lastError?: string
  lastRefreshStarted: number
  timer?: NodeJS.Timeout
  saveTimer?: NodeJS.Timeout
  loadedFromDisk: boolean
}

const state: State = {
  likes: {},
  attachments: [],
  attachedContracts: {},
  feedback: [],
  refreshing: false,
  lastRefreshStarted: 0,
  loadedFromDisk: false,
}

const cachePath = () =>
  process.env.NEWS_FEED_CACHE_PATH ??
  path.join(os.tmpdir(), 'manifold-news-feed-cache.json')

function loadFromDisk() {
  if (state.loadedFromDisk) return
  state.loadedFromDisk = true
  try {
    const parsed = JSON.parse(fs.readFileSync(cachePath(), 'utf8')) as CacheFile
    if (parsed?.likes && typeof parsed.likes === 'object') {
      state.likes = mapValues(parsed.likes, (ids) =>
        Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : []
      )
    }
    if (Array.isArray(parsed?.attachments))
      state.attachments = parsed.attachments
    if (
      parsed?.attachedContracts &&
      typeof parsed.attachedContracts === 'object'
    )
      state.attachedContracts = parsed.attachedContracts
    if (Array.isArray(parsed?.feedback)) state.feedback = parsed.feedback
    if (
      parsed &&
      Array.isArray(parsed.stories) &&
      parsed.contractsById &&
      Date.now() - parsed.updatedTime < CACHE_MAX_AGE_MS
    ) {
      if (parsed.tollbitSpend) setTollbitSpend(parsed.tollbitSpend)
      // Served as this configuration allows: the cache may be another's.
      state.build = sanitizeForConfig(
        omit(
          parsed,
          'likes',
          'attachments',
          'attachedContracts',
          'feedback',
          'tollbitSpend'
        ),
        Date.now()
      )
      log('news-feed: loaded cached build', {
        stories: parsed.stories.length,
        likedStories: Object.keys(state.likes).length,
        attachments: state.attachments.length,
        feedback: state.feedback.length,
        updatedTime: new Date(parsed.updatedTime).toISOString(),
      })
    }
  } catch {
    // No cache yet, or an unreadable one: the first refresh replaces it.
  }
}

function saveToDisk() {
  if (!state.build) return
  try {
    const slim: CacheFile = {
      ...state.build,
      memos: mapValues(state.build.memos, (m) => omit(m, 'embedding')),
      likes: state.likes,
      attachments: state.attachments,
      attachedContracts: state.attachedContracts,
      feedback: state.feedback,
      tollbitSpend: getTollbitSpend(),
    }
    fs.writeFileSync(cachePath(), JSON.stringify(slim))
  } catch (e) {
    log.warn('news-feed: could not write cache', { error: String(e) })
  }
}

function scheduleSave() {
  if (state.saveTimer) return
  state.saveTimer = setTimeout(() => {
    state.saveTimer = undefined
    saveToDisk()
  }, SAVE_DEBOUNCE_MS)
  state.saveTimer.unref?.()
}

export function getNewsFeedBuild() {
  loadFromDisk()
  return state.build
}

export function getNewsFeedStatus() {
  loadFromDisk()
  return {
    refreshing: state.refreshing,
    updatedTime: state.build?.updatedTime ?? null,
    lastError: state.lastError,
  }
}

export function getNewsLikes(): Readonly<Likes> {
  loadFromDisk()
  return state.likes
}

/** Record or withdraw a user's like on a story; returns the new count. */
export function setNewsStoryLike(
  storyId: string,
  userId: string,
  liked: boolean
) {
  loadFromDisk()
  const current = state.likes[storyId] ?? []
  const next = liked
    ? current.includes(userId)
      ? current
      : [...current, userId]
    : current.filter((id) => id !== userId)
  if (next.length === 0) delete state.likes[storyId]
  else state.likes[storyId] = next
  scheduleSave()
  return next.length
}

export function getNewsAttachments(): {
  attachments: readonly NewsAttachment[]
  contracts: Readonly<Record<string, Contract>>
} {
  loadFromDisk()
  return { attachments: state.attachments, contracts: state.attachedContracts }
}

/**
 * Link an existing market to a story, as the direct test of a claim or as a
 * related forecast. A later link for the same claim replaces the earlier
 * one; the same market is not attached to a story twice.
 */
export function attachNewsMarket(
  a: Omit<NewsAttachment, 'time'>,
  contract: Contract
) {
  loadFromDisk()
  state.attachments = state.attachments.filter(
    (x) =>
      !(
        x.storyId === a.storyId &&
        (x.contractId === a.contractId ||
          (a.claimId && a.relation === 'direct' && x.claimId === a.claimId))
      )
  )
  state.attachments.push({ ...a, time: Date.now() })
  state.attachedContracts[contract.id] = contract
  scheduleSave()
}

export function addNewsFeedback(entry: Omit<NewsFeedbackEntry, 'time'>) {
  loadFromDisk()
  state.feedback.push({ ...entry, time: Date.now() })
  if (state.feedback.length > MAX_FEEDBACK)
    state.feedback = state.feedback.slice(-MAX_FEEDBACK)
  log('news-feed: reader feedback', entry)
  scheduleSave()
}

async function runRefresh(reason: string) {
  state.refreshing = true
  state.lastRefreshStarted = Date.now()
  const started = Date.now()
  const askedFor = new Set(state.attachments.map((a) => a.contractId))
  log('news-feed: refresh started', { reason })
  try {
    const build = await buildNewsFeed(
      state.build,
      Date.now(),
      state.attachments.map((a) => a.contractId)
    )
    state.build = build
    state.lastError = undefined
    // What readers added to stories that dropped off the feed goes with them.
    const kept = new Set(build.stories.map((s) => s.id))
    for (const id of Object.keys(state.likes))
      if (!kept.has(id)) delete state.likes[id]
    // A market the build was asked to load and left out has closed,
    // resolved or gone private: its attachments go. Ones added while the
    // build ran were not asked for and stay until the next refresh.
    state.attachments = state.attachments.filter(
      (a) =>
        kept.has(a.storyId) &&
        (build.contractsById[a.contractId] || !askedFor.has(a.contractId))
    )
    const attachedIds = new Set(state.attachments.map((a) => a.contractId))
    for (const id of Object.keys(state.attachedContracts)) {
      if (!attachedIds.has(id)) delete state.attachedContracts[id]
      // The build has the fresh copy now.
      else if (build.contractsById[id])
        state.attachedContracts[id] = build.contractsById[id]
    }
    saveToDisk()
    log('news-feed: refresh done', {
      reason,
      stories: build.stories.length,
      linked: build.stories.filter((s) => s.contractIds.length > 0).length,
      withClaims: build.stories.filter((s) => s.claimsStatus === 'found')
        .length,
      contracts: Object.keys(build.contractsById).length,
      seconds: Math.round((Date.now() - started) / 1000),
    })
  } catch (e) {
    state.lastError = e instanceof Error ? e.message : String(e)
    log.error('news-feed: refresh failed', { reason, error: state.lastError })
  } finally {
    state.refreshing = false
  }
}

/**
 * Rebuild the feed. Returns false when a refresh is already running or one
 * started less than `minIntervalMs` ago. With `waitForCompletion` false the
 * build runs in the background and the call returns at once.
 */
export async function refreshNewsFeed(
  reason: string,
  opts: { minIntervalMs?: number; waitForCompletion?: boolean } = {}
) {
  loadFromDisk()
  if (state.refreshing) {
    // A refresh that has run far past its budget is treated as wedged (a
    // hung upstream call) rather than left to block every later refresh.
    if (Date.now() - state.lastRefreshStarted < REFRESH_BUDGET_MS) return false
    log.warn('news-feed: previous refresh overran its budget; starting anew', {
      startedAt: new Date(state.lastRefreshStarted).toISOString(),
    })
  }
  if (
    opts.minIntervalMs &&
    Date.now() - state.lastRefreshStarted < opts.minIntervalMs
  ) {
    return false
  }
  const run = runRefresh(reason)
  if (opts.waitForCompletion !== false) await run
  return true
}

export function startNewsFeedRefresher(intervalMs = NEWS_FEED_REFRESH_MS) {
  if (state.timer) return
  void refreshNewsFeed('startup')
  state.timer = setInterval(() => {
    void refreshNewsFeed('interval')
  }, intervalMs)
  state.timer.unref?.()
}
