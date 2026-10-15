import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { mapValues, omit } from 'lodash'
import { MINUTE_MS } from 'common/util/time'
import { log } from 'shared/utils'
import { buildNewsFeed, NewsFeedBuild } from './pipeline'

/**
 * One build of the feed per process, refreshed on a timer. The build is
 * cached on disk (minus embeddings) so a restart serves the last feed at once
 * instead of spending two minutes and a few cents rebuilding it.
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

type State = {
  build?: NewsFeedBuild
  refreshing: boolean
  lastError?: string
  lastRefreshStarted: number
  timer?: NodeJS.Timeout
  loadedFromDisk: boolean
}

const state: State = {
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
    const parsed = JSON.parse(
      fs.readFileSync(cachePath(), 'utf8')
    ) as NewsFeedBuild
    if (
      parsed &&
      Array.isArray(parsed.stories) &&
      parsed.contractsById &&
      Date.now() - parsed.updatedTime < CACHE_MAX_AGE_MS
    ) {
      state.build = parsed
      log('news-feed: loaded cached build', {
        stories: parsed.stories.length,
        updatedTime: new Date(parsed.updatedTime).toISOString(),
      })
    }
  } catch {
    // No cache yet, or an unreadable one: the first refresh replaces it.
  }
}

function saveToDisk(build: NewsFeedBuild) {
  try {
    const slim: NewsFeedBuild = {
      ...build,
      memos: mapValues(build.memos, (m) => omit(m, 'embedding')),
    }
    fs.writeFileSync(cachePath(), JSON.stringify(slim))
  } catch (e) {
    log.warn('news-feed: could not write cache', { error: String(e) })
  }
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

async function runRefresh(reason: string) {
  state.refreshing = true
  state.lastRefreshStarted = Date.now()
  const started = Date.now()
  log('news-feed: refresh started', { reason })
  try {
    const build = await buildNewsFeed(state.build)
    state.build = build
    state.lastError = undefined
    saveToDisk(build)
    log('news-feed: refresh done', {
      reason,
      stories: build.stories.length,
      linked: build.stories.filter((s) => s.contractIds.length > 0).length,
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
