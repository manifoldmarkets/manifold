import { camelCase } from 'lodash'
import { ENV } from 'common/envs/constants'
import { getUser, log as logger, revalidateStaticProps } from 'shared/utils'
import { annotateScoreChanges } from 'shared/sports-goal-annotations'
import {
  createSupabaseDirectClient,
  pgp,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { resolveMarketHelper } from 'shared/resolve-market-helpers'
import { anythingToRichText } from 'shared/tiptap'
import { convertAnswer, convertContract } from 'common/supabase/contracts'
import {
  generateContractEmbeddings,
  updateContract,
} from 'shared/supabase/contracts'
import {
  Contract,
  contractPath,
  CPMMMultiContract,
  nativeContractColumnsArray,
} from 'common/contract'
import { insert, bulkInsert, bulkInsertQuery } from 'shared/supabase/utils'
import { answerToRow } from 'shared/supabase/answers'
import { generateAntes } from 'shared/create-contract-helpers'
import { runTxnOutsideBetQueue } from 'shared/txn/run-txn'
import { addGroupToContract } from 'shared/update-group-contracts-internal'
import {
  broadcastNewComment,
  broadcastSportsLiveScore,
} from 'shared/websockets/helpers'
import { ContractComment } from 'common/comment'
import { millisToTs } from 'common/supabase/utils'
import { removeUndefinedProps } from 'common/util/object'
import { completeCalculatedQuestFromTrigger } from 'shared/complete-quest-internal'
import { createNewContractNotification } from 'shared/notifications/create-new-contract-notif'
import { createCommentOnContractNotification } from 'shared/notifications/create-new-contract-comment-notif'
import { upsertGroupEmbedding } from 'shared/helpers/embeddings'
import { parseMentions, richTextToString } from 'common/util/parse'
import { User } from 'common/user'
import { JSONContent } from '@tiptap/core'
import { getNewContract } from 'common/new-contract'
import { getAnte } from 'common/economy'
import { slugify } from 'common/util/slugify'
import { randomString } from 'common/util/random'
import {
  LiquidityTierValue,
  StageLiquidityTiers,
  TournamentConfig,
  TOURNAMENT_CONFIGS,
  WORLD_CUP_2026,
  CHAMPIONS_LEAGUE_2026,
  PREMIER_LEAGUE_2526,
  pickSportsWinningAnswer,
  finalScoreCommentLines,
  FDMatch,
  MarketCreateParams,
  sportsEventId,
  buildMarketParams,
  buildDescription,
  stageLabel,
  stageLiquidityForMatch,
  computeCloseTime,
  teamFlagFromArea,
  flagEmoji,
} from 'common/sports'

// Pure config + market-shape builders now live in common/sports.ts (testable
// without the backend); re-exported here so existing `shared/sports-markets`
// importers (admin handlers, etc.) keep working unchanged.
export type {
  LiquidityTierValue,
  StageLiquidityTiers,
  TournamentConfig,
  FDMatch,
  MarketCreateParams,
}
export {
  TOURNAMENT_CONFIGS,
  WORLD_CUP_2026,
  CHAMPIONS_LEAGUE_2026,
  PREMIER_LEAGUE_2526,
  buildMarketParams,
  buildDescription,
  stageLabel,
  stageLiquidityForMatch,
  computeCloseTime,
  teamFlagFromArea,
  flagEmoji,
  sportsEventId as matchSportsEventId,
}

// SQL predicate for an *active* sports market: a live, visible mana contract.
// The autocreate flow (manual admin panel + scheduler cron) de-dupes new markets
// against this, so once a market has been resolved N/A, hidden (unlisted), or
// deleted, its fixture is treated as free and a corrected market can be
// regenerated. Static fragment — no user input, safe to interpolate into SQL.
export const ACTIVE_SPORTS_MARKET_FILTER = `token = 'MANA'
    and resolution is distinct from 'CANCEL'
    and coalesce(deleted, false) = false
    and coalesce(visibility, 'public') <> 'unlisted'`

export interface ResolveLogEntry {
  question: string
  result: string
  status: 'resolved' | 'skipped' | 'error'
}

// ─── Group auto-creation ──────────────────────────────────────────────────────

export interface GroupEnsureResult {
  id: string
  created: boolean
  restricted: boolean
}

/**
 * Ensure the official tournament group exists and is curated (admin-restricted).
 * Creates it if missing. Updates privacy_status to 'curated' if it exists but is public.
 * Always runs before any market creation — idempotent.
 */
export async function ensureOfficialGroup(
  config: TournamentConfig,
  creatorId: string,
  pg: SupabaseDirectClient
): Promise<GroupEnsureResult> {
  const slug = config.officialGroupSlug

  const existing = await pg.oneOrNone<{
    id: string
    privacy_status: string
  }>(
    `select id, privacy_status from groups where slug = $1 limit 1`,
    [slug]
  )

  if (existing) {
    let restricted = existing.privacy_status === 'curated'
    if (!restricted) {
      await pg.none(
        `update groups set privacy_status = 'curated' where id = $1`,
        [existing.id]
      )
      restricted = true
    }
    return { id: existing.id, created: false, restricted }
  }

  const group = await insert(pg, 'groups', {
    creator_id: creatorId,
    slug,
    name: config.officialGroupName,
    about: anythingToRichText({ raw: `Official Manifold Sports markets for ${config.name}. Managed by @ManifoldSports.` }),
    total_members: 1,
    privacy_status: 'curated',
  })

  await bulkInsert(pg, 'group_members', [
    { group_id: group.id, member_id: creatorId, role: 'admin' },
  ])

  return { id: group.id, created: true, restricted: true }
}

export interface CommunityAssetsResult {
  groupId: string
  groupCreated: boolean
  dashboardId: string
  dashboardCreated: boolean
}

/**
 * Ensure the community group + dashboard exist for a tournament.
 * Both are curated (admin-restricted for adding). Idempotent.
 * Call this alongside ensureOfficialGroup when batch-creating markets.
 */
export async function ensureCommunityAssets(
  config: TournamentConfig,
  creatorId: string,
  creatorUsername: string,
  creatorName: string,
  creatorAvatarUrl: string,
  pg: SupabaseDirectClient
): Promise<CommunityAssetsResult> {
  // ── Community group ──────────────────────────────────────────────────────────
  const groupSlug = config.communityGroupSlug
  let groupCreated = false

  const existingGroup = await pg.oneOrNone<{ id: string }>(
    `select id from groups where slug = $1 limit 1`,
    [groupSlug]
  )

  let groupId: string
  if (existingGroup) {
    groupId = existingGroup.id
    await pg.none(
      `update groups set privacy_status = 'curated' where id = $1`,
      [groupId]
    )
  } else {
    const group = await insert(pg, 'groups', {
      creator_id: creatorId,
      slug: groupSlug,
      name: `MS Community: ${config.name}`,
      about: anythingToRichText({ raw: `Community markets for ${config.name}. Curated by Manifold admins.` }),
      total_members: 1,
      privacy_status: 'curated',
    })
    await bulkInsert(pg, 'group_members', [
      { group_id: group.id, member_id: creatorId, role: 'admin' },
    ])
    groupId = group.id
    groupCreated = true
  }

  // ── Community dashboard ──────────────────────────────────────────────────────
  const dashSlug = config.communityDashboardSlug
  let dashboardCreated = false

  const existingDash = await pg.oneOrNone<{ id: string }>(
    `select id from dashboards where slug = $1 limit 1`,
    [dashSlug]
  )

  let dashboardId: string
  if (existingDash) {
    dashboardId = existingDash.id
  } else {
    const dash = await pg.one<{ id: string }>(
      `insert into dashboards(slug, creator_id, title, items, creator_username, creator_name, creator_avatar_url)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id`,
      [
        dashSlug,
        creatorId,
        `MS Community: ${config.name}`,
        JSON.stringify([]),
        creatorUsername,
        creatorName,
        creatorAvatarUrl,
      ]
    )
    dashboardId = dash.id
    dashboardCreated = true
  }

  return { groupId, groupCreated, dashboardId, dashboardCreated }
}

// ─── Football-data.org API ────────────────────────────────────────────────────

// football-data.org communicates its rate limit through response headers, not a
// fixed quota — per their explicit guidance to API clients, we read those headers
// after every call and self-throttle so we never trip the limiter. State is
// module-level so the budget is shared across every fdFetch in the process: the
// create/resolve jobs and any future live poller all draw from the same counter.
let fdRequestsAvailable: number | null = null
let fdResetSeconds: number | null = null

// Hard floor on spacing between football-data calls: 3.5s ⇒ ≤ ~17/min, safely
// under the 20/min budget no matter how many tournaments are active at once
// (the header-based throttle above still handles precise pacing on top of this).
const FD_MIN_GAP_MS = 3500
let fdLastCallMs = 0

// All football-data calls run one-at-a-time through this promise chain. The
// throttle state above is module-global, and the scheduler runs sports-live
// (every 10s), sports-resolve, and sports-create in the same process — without
// serialization two overlapping jobs could both pass the "budget spent" gate
// before either sleeps, under-throttling into a real 429/ban.
let fdQueue: Promise<unknown> = Promise.resolve()
function fdSerialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = fdQueue.then(fn, fn)
  fdQueue = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

// Reads a numeric header, tolerating football-data's spelling variants across
// API versions (e.g. X-Requests-Available vs X-RequestsAvailable). Header lookup
// is case-insensitive but hyphen-sensitive, so we try each known form.
function fdNumericHeader(headers: Headers, names: string[]): number | null {
  for (const name of names) {
    const raw = headers.get(name)
    if (raw !== null && raw !== '') {
      const n = Number(raw)
      if (Number.isFinite(n)) return n
    }
  }
  return null
}

function recordFdThrottle(headers: Headers) {
  fdRequestsAvailable = fdNumericHeader(headers, [
    'X-Requests-Available',
    'X-RequestsAvailable',
    'X-Requests-Available-Minute',
  ])
  fdResetSeconds = fdNumericHeader(headers, [
    'X-RequestCounter-Reset',
    'X-RequestCounterReset',
  ])
}

function fdFetch<T>(path: string, apiKey: string): Promise<T> {
  return fdSerialize(() => fdFetchInner<T>(path, apiKey))
}

async function fdFetchInner<T>(path: string, apiKey: string): Promise<T> {
  // Read at call time so FOOTBALL_DATA_BASE_URL can be set after module load (e.g. test scripts)
  const base = process.env.FOOTBALL_DATA_BASE_URL ?? 'https://api.football-data.org'

  // Proactive throttle: if the previous response reported the budget is spent,
  // wait for the counter to reset before issuing another request.
  if (fdRequestsAvailable !== null && fdRequestsAvailable <= 0) {
    await sleep(((fdResetSeconds ?? 60) + 1) * 1000)
    fdRequestsAvailable = null
    fdResetSeconds = null
  }

  // Enforce the minimum gap since the last call (calls are already serialized).
  const sinceLast = Date.now() - fdLastCallMs
  if (sinceLast < FD_MIN_GAP_MS) await sleep(FD_MIN_GAP_MS - sinceLast)
  fdLastCallMs = Date.now()

  const doFetch = () =>
    fetch(`${base}${path}`, {
      headers: { 'X-Auth-Token': apiKey, connection: 'close' },
      // Cap each request so a hung football-data connection can't stall the
      // shared serialized queue (and thereby every sports job) indefinitely.
      signal: AbortSignal.timeout(15_000),
    })

  let res = await doFetch()
  recordFdThrottle(res.headers)

  // Reactive throttle: a 429 means we got ahead of the limiter anyway — wait the
  // advertised window (Retry-After, else the reset counter) and retry once.
  if (res.status === 429) {
    const waitSeconds =
      fdNumericHeader(res.headers, ['Retry-After']) ?? fdResetSeconds ?? 60
    await sleep((waitSeconds + 1) * 1000)
    res = await doFetch()
    recordFdThrottle(res.headers)
  }

  if (!res.ok) {
    throw new Error(
      `football-data.org ${path} → ${res.status} ${res.statusText}`
    )
  }
  return res.json() as Promise<T>
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function fetchAllCompetitionMatches(
  config: TournamentConfig,
  apiKey: string,
  opts: { dateFrom?: string; dateTo?: string; status?: string } = {}
): Promise<FDMatch[]> {
  let path = `/v4/competitions/${encodeURIComponent(config.footballDataCode)}/matches`
  const params: string[] = []
  if (opts.status) params.push(`status=${encodeURIComponent(opts.status)}`)
  if (opts.dateFrom) params.push(`dateFrom=${encodeURIComponent(opts.dateFrom)}`)
  if (opts.dateTo) params.push(`dateTo=${encodeURIComponent(opts.dateTo)}`)
  if (params.length) path += '?' + params.join('&')

  const data = await fdFetch<{ matches: FDMatch[] }>(path, apiKey)
  return data.matches ?? []
}

export async function fetchFinishedMatches(
  config: TournamentConfig,
  apiKey: string
): Promise<FDMatch[]> {
  return fetchAllCompetitionMatches(config, apiKey, { status: 'FINISHED' })
}

export async function fetchSingleMatch(
  matchId: number,
  apiKey: string
): Promise<FDMatch> {
  const data = await fdFetch<{ match: FDMatch }>(
    `/v4/matches/${encodeURIComponent(String(matchId))}`,
    apiKey
  )
  return data.match
}

export async function fetchInPlayMatches(
  config: TournamentConfig,
  apiKey: string
): Promise<FDMatch[]> {
  return fetchAllCompetitionMatches(config, apiKey, { status: 'IN_PLAY' })
}

// ─── Resolution ───────────────────────────────────────────────────────────────

interface UnresolvedSportsMarket {
  id: string
  sportsEventId: string
  answers: Array<{ id: string; text: string }>
  question: string
}

type SportsContractData = CPMMMultiContract & { sportsEventId?: string }

async function getUnresolvedSportsMarkets(
  pg: SupabaseDirectClient,
  config: TournamentConfig,
  creatorId: string
): Promise<UnresolvedSportsMarket[]> {
  const rows = await pg.manyOrNone<{ data: SportsContractData }>(
    `select data from contracts
     where data->>'sportsLeague' = $1
       and creator_id = $2
       and resolution is null
       and outcome_type = 'MULTIPLE_CHOICE'
       and token = 'MANA'`,
    [config.sportsLeague, creatorId]
  )

  return rows.map((r) => {
    const data = r.data
    return {
      id: data.id,
      sportsEventId: data.sportsEventId ?? '',
      answers: (data.answers ?? []).map((a) => ({ id: a.id, text: a.text })),
      question: data.question,
    }
  })
}

// Post the final score on the market as @ManifoldSports, mirroring the
// comments the account used to leave by hand. Replicates api/create-comment's
// insert plus its side effects (which shared can't import): broadcast,
// follower notifications, lastCommentTime bump, and static-page revalidation.
// Only the parts meaningless for this account are skipped: bet/position
// denormalization, fees, and the AI clarification check (gated on
// unresolved markets anyway — this runs right after resolution).
async function postFinalScoreComment(
  pg: SupabaseDirectClient,
  contract: CPMMMultiContract,
  creator: User,
  match: FDMatch
) {
  const lines = finalScoreCommentLines(match)
  if (!lines) return

  const content: JSONContent[] = []
  lines.forEach((line, i) => {
    if (i > 0) content.push({ type: 'hardBreak' })
    content.push({ type: 'text', text: line })
  })

  const now = Date.now()
  const comment = removeUndefinedProps({
    id: randomString(),
    content: { type: 'doc', content: [{ type: 'paragraph', content }] },
    createdTime: now,
    userId: creator.id,
    userName: creator.name,
    userUsername: creator.username,
    userAvatarUrl: creator.avatarUrl,
    commentType: 'contract',
    contractId: contract.id,
    contractSlug: contract.slug,
    contractQuestion: contract.question,
    visibility: contract.visibility,
  } as ContractComment)

  await pg.none(
    `insert into contract_comments (contract_id, comment_id, user_id, created_time, data)
     values ($1, $2, $3, $4, $5)`,
    [contract.id, comment.id, creator.id, millisToTs(now), comment]
  )
  broadcastNewComment(contract.id, contract.visibility, creator, comment)

  await updateContract(pg, contract.id, {
    lastCommentTime: now,
    lastUpdatedTime: Date.now(),
  })
  // Resolution revalidated the page just before this comment existed; do it
  // again so new visitors get the comment in the statically cached page.
  await revalidateStaticProps(contractPath(contract)).catch((e) =>
    logger.error(
      `[sports-resolve] revalidate after score comment failed for ${contract.id}: ${e}`
    )
  )
  // Same follower/watcher fan-out a manual comment from the account would
  // trigger. No replies or mentions in a score comment, and never marked as
  // requiring a creator response.
  await createCommentOnContractNotification(
    comment.id,
    creator,
    lines.join('\n'),
    contract,
    {},
    [],
    false
  )
}

// Resolve unresolved markets against an already-fetched set of terminal
// (FINISHED/AWARDED) matches. Shared by the 15-min backstop cron and the 10s
// live poller, so a finished match resolves within ~10s of full time off the
// same frequent pull instead of waiting up to 15 min.
export async function resolveTournamentMarketsForMatches(
  config: TournamentConfig,
  terminalMatches: FDMatch[],
  opts: { dryRun?: boolean } = {}
): Promise<{
  resolved: number
  skipped: number
  errors: number
  log: ResolveLogEntry[]
}> {
  const { dryRun = false } = opts
  const pg = createSupabaseDirectClient()
  const log: ResolveLogEntry[] = []

  const creatorId =
    ENV === 'DEV'
      ? config.manifoldSportsUserId.dev
      : config.manifoldSportsUserId.prod

  const creatorUser = await getUser(creatorId)
  if (!creatorUser) throw new Error(`ManifoldSports user ${creatorId} not found`)

  const unresolvedMarkets = await getUnresolvedSportsMarkets(pg, config, creatorId)

  if (unresolvedMarkets.length === 0)
    return { resolved: 0, skipped: 0, errors: 0, log }

  const finishedById = new Map(terminalMatches.map((m) => [sportsEventId(m), m]))

  let resolved = 0
  let skipped = 0
  let errors = 0

  for (const market of unresolvedMarkets) {
    const match = finishedById.get(market.sportsEventId)
    if (!match) {
      skipped++
      log.push({ question: market.question, result: 'Match not finished yet', status: 'skipped' })
      continue
    }

    const { winner } = match.score
    if (!winner) {
      skipped++
      log.push({ question: market.question, result: 'No winner recorded', status: 'skipped' })
      continue
    }

    const winningAnswer = pickSportsWinningAnswer(
      {
        homeTeamName: match.homeTeam.name,
        awayTeamName: match.awayTeam.name,
        winner,
      },
      market.answers
    )
    if (!winningAnswer) {
      errors++
      const winningText =
        winner === 'HOME_TEAM'
          ? match.homeTeam.name
          : winner === 'AWAY_TEAM'
          ? match.awayTeam.name
          : 'Draw'
      log.push({
        question: market.question,
        result: `No answer matching "${winningText}"`,
        status: 'error',
      })
      continue
    }

    if (dryRun) {
      resolved++
      log.push({
        question: market.question,
        result: `Would resolve → ${winningAnswer.text}`,
        status: 'resolved',
      })
      continue
    }

    try {
      const contractRow = await pg.oneOrNone<{
        data: any
        importance_score: number | null
      }>(`select data, importance_score from contracts where id = $1`, [market.id])

      if (!contractRow) {
        errors++
        log.push({ question: market.question, result: 'Contract not found in DB', status: 'error' })
        continue
      }

      const contract = convertContract(contractRow) as CPMMMultiContract
      await resolveMarketHelper(contract, creatorUser, creatorUser, {
        outcome: winningAnswer.id,
        resolutions: { [winningAnswer.id]: 100 },
      })
      // Store final score (+ how it was decided) for dashboard display. fullTime
      // is the post-ET aggregate; for a shootout we also store the penalty score
      // so the card can show e.g. "1–1 · 4–2 pens" instead of a bare 1–1 next to
      // the advancing team.
      const homeScore = match.score.fullTime.home
      const awayScore = match.score.fullTime.away
      if (homeScore !== null && awayScore !== null) {
        const scorePatch: Record<string, unknown> = {
          sportsHomeScore: homeScore,
          sportsAwayScore: awayScore,
          sportsScoreDuration: match.score.duration,
        }
        const pens = match.score.penalties
        if (pens && pens.home != null && pens.away != null) {
          scorePatch.sportsPenHome = pens.home
          scorePatch.sportsPenAway = pens.away
        }
        await pg.none(
          `update contracts set data = data || $1::jsonb where id = $2`,
          [JSON.stringify(scorePatch), market.id]
        )
      }
      // The market is resolved at this point, so a comment failure is
      // logged but doesn't count the resolution as an error (and won't
      // retry — the market no longer appears in the unresolved set).
      try {
        await postFinalScoreComment(pg, contract, creatorUser, match)
      } catch (e) {
        logger.error(
          `[sports-resolve] final-score comment failed for ${market.id}: ${
            e instanceof Error ? e.message : e
          }`
        )
      }
      resolved++
      log.push({ question: market.question, result: winningAnswer.text, status: 'resolved' })
    } catch (e) {
      errors++
      log.push({
        question: market.question,
        result: e instanceof Error ? e.message : String(e),
        status: 'error',
      })
    }
  }

  return { resolved, skipped, errors, log }
}

// Backstop cron path: fetch all matches, keep the terminal ones, resolve. We
// fetch unfiltered (not status=FINISHED) because AWARDED walkovers carry a winner
// but aren't FINISHED. The 10s live poller resolves most matches first; this is
// the safety net for anything it missed (e.g. finished outside an active window).
export async function resolveTournamentMarkets(
  config: TournamentConfig,
  apiKey: string,
  opts: { dryRun?: boolean } = {}
): Promise<{
  resolved: number
  skipped: number
  errors: number
  log: ResolveLogEntry[]
}> {
  const allMatches = await fetchAllCompetitionMatches(config, apiKey)
  const terminal = allMatches.filter(
    (m) => m.status === 'FINISHED' || m.status === 'AWARDED'
  )
  return resolveTournamentMarketsForMatches(config, terminal, opts)
}

// ─── Market creation ───────────────────────────────────────────────────────────

export interface CreateLogEntry {
  question: string
  result: string
  status: 'created' | 'skipped' | 'error' | 'dry-run'
}

function isoDateStr(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/**
 * Post-creation side-effects, mirroring api/helpers/on-create-market.ts for the
 * cron path. onCreateMarket itself can't be imported here (it lives in
 * backend/api, which the scheduler can't depend on), so we replicate the steps
 * that matter for an auto-created sports market using shared-layer primitives.
 *
 * Deliberate deviations from onCreateMarket:
 * - `notifyFollowers` defaults to false. A faithful mirror would notify every
 *   follower of @ManifoldSports on every market — but creation always happens in
 *   batches (the daily cron, or an admin selecting many fixtures), which would
 *   storm followers. Both the cron and the admin create path call this with
 *   notifyFollowers:false; pass true per-call if a notification is ever wanted.
 * - The non-predictive / unranked-group check is skipped: sports markets are
 *   always predictive, so isContractNonPredictive would never fire.
 */
export async function runSportsMarketPostCreate(
  pg: SupabaseDirectClient,
  contract: CPMMMultiContract,
  creator: User,
  opts: { notifyFollowers?: boolean } = {}
): Promise<void> {
  const eventId = contract.id + '-on-create'

  // Quest progress — a no-op for the bot account, kept for parity.
  await completeCalculatedQuestFromTrigger(
    creator,
    'MARKETS_CREATED',
    eventId,
    contract.id
  )

  // Creator follows its own market so resolution updates reach it (replicates
  // followContractInternal, which lives in backend/api).
  await pg.none(
    `insert into contract_follows (contract_id, follow_id)
     values ($1, $2)
     on conflict (contract_id, follow_id) do nothing`,
    [contract.id, creator.id]
  )

  if (opts.notifyFollowers) {
    const desc = contract.description as JSONContent
    await createNewContractNotification(
      creator,
      contract,
      eventId,
      richTextToString(desc),
      parseMentions(desc)
    )
  }

  // Refresh group embeddings for discoverability (public markets only) — the
  // markets were already tagged into their groups by the caller.
  if (contract.visibility === 'public') {
    const groupIds = await pg.map(
      `select group_id from group_contracts where contract_id = $1`,
      [contract.id],
      (r) => r.group_id as string
    )
    await Promise.all(groupIds.map((gId) => upsertGroupEmbedding(pg, gId)))
  }
}

export async function createTournamentMarkets(
  config: TournamentConfig,
  apiKey: string,
  opts: {
    daysAhead?: number
    dryRun?: boolean
    dashboardUrl?: string
    notifyFollowers?: boolean
  } = {}
): Promise<{ created: number; skipped: number; errors: number; log: CreateLogEntry[] }> {
  const { daysAhead = 7, dryRun = false, dashboardUrl } = opts
  const pg = createSupabaseDirectClient()
  const log: CreateLogEntry[] = []

  const creatorId =
    ENV === 'DEV'
      ? config.manifoldSportsUserId.dev
      : config.manifoldSportsUserId.prod

  if (creatorId.startsWith('TODO_')) {
    throw new Error(`[sports-create] ${config.footballDataCode}: manifoldSportsUserId not configured`)
  }

  const creatorUser = await getUser(creatorId)
  if (!creatorUser) throw new Error(`ManifoldSports user ${creatorId} not found`)

  const groupResult = await ensureOfficialGroup(config, creatorId, pg)

  const dateFrom = isoDateStr(new Date())
  const dateTo = isoDateStr(new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000))

  await sleep(500)
  const matches = await fetchAllCompetitionMatches(config, apiKey, {
    status: 'SCHEDULED',
    dateFrom,
    dateTo,
  })

  let created = 0
  let skipped = 0
  let errors = 0

  for (const match of matches) {
    const { homeTeam, awayTeam } = match
    const matchLabel = `${homeTeam.name || '?'} vs ${awayTeam.name || '?'}`

    if (!homeTeam.name || !awayTeam.name) {
      skipped++
      log.push({ question: matchLabel, result: 'Teams not yet determined', status: 'skipped' })
      continue
    }

    const eventId = sportsEventId(match)

    const existing = await pg.oneOrNone<{ id: string }>(
      `select id from contracts
       where data->>'sportsEventId' = $1 and ${ACTIVE_SPORTS_MARKET_FILTER}
       limit 1`,
      [eventId]
    )
    if (existing) {
      skipped++
      log.push({ question: matchLabel, result: 'Market already exists', status: 'skipped' })
      continue
    }

    const params = buildMarketParams(match, config, groupResult.id, { dashboardUrl })

    if (dryRun) {
      created++
      log.push({ question: params.question, result: 'Would create', status: 'dry-run' })
      continue
    }

    try {
      const ante = getAnte('MULTIPLE_CHOICE', params.answers.length, params.liquidityTier)
      const proposedSlug = slugify(params.question)
      const slugExists = await pg.oneOrNone<{ id: string }>(
        `select id from contracts where slug = $1 limit 1`,
        [proposedSlug]
      )
      const slug = slugExists ? `${proposedSlug}-${randomString(4)}` : proposedSlug

      const description =
        anythingToRichText({ markdown: params.descriptionMarkdown }) ??
        anythingToRichText({ raw: '' })!

      const contract = getNewContract({
        id: randomString(),
        slug,
        creator: creatorUser,
        question: params.question,
        outcomeType: 'MULTIPLE_CHOICE',
        description,
        initialProb: 50,
        ante,
        closeTime: params.closeTime,
        visibility: 'public',
        isTwitchContract: undefined,
        token: 'MANA',
        takerAPIOrdersDisabled: undefined,
        siblingContractId: undefined,
        coverImageUrl: undefined,
        min: 0,
        max: 0,
        isLogScale: false,
        answers: params.answers,
        addAnswersMode: 'DISABLED',
        shouldAnswersSumToOne: true,
        answerShortTexts: params.answerShortTexts,
        answerImageUrls: params.answerImageUrls.length > 0 ? params.answerImageUrls : undefined,
        sportsStartTimestamp: params.sportsStartTimestamp,
        sportsEventId: params.sportsEventId,
        sportsLeague: params.sportsLeague,
        unit: undefined,
        midpoints: undefined,
        timezone: undefined,
        voterVisibility: undefined,
        pollType: undefined,
        maxSelections: undefined,
      }) as CPMMMultiContract

      const providerId = creatorId

      // Insert with all native columns set (creator_id, slug, outcome_type,
      // mechanism, importance_score, freshness_score, etc.) — mirrors
      // createMarketHelper in api/create-market.ts so feed ranking, search,
      // and other systems that read native columns work correctly.
      const nativeColumns = nativeContractColumnsArray.filter((c) => c !== 'data')
      const nativeValues = nativeColumns.map((column) => {
        const camelKey = camelCase(column) as keyof Contract
        return camelKey in contract ? contract[camelKey] : null
      })
      const nativeKeys = nativeColumns.map(camelCase)
      const contractDataToInsert = Object.fromEntries(
        Object.entries(contract).filter(([key]) => !nativeKeys.includes(key))
      )

      const insertAnswersQuery = bulkInsertQuery(
        'answers',
        contract.answers.map(answerToRow),
        true
      )
      const contractQuery = pgp.as.format(
        `insert into contracts (id, data, ${nativeColumns.join(',')})
         values ($1, $2, ${nativeValues.map((_, i) => `$${i + 3}`).join(',')})`,
        [contract.id, JSON.stringify(contractDataToInsert), ...nativeValues]
      )

      const result = await pg.tx(async (tx) => {
        const rows = await tx.multi(`${contractQuery}; ${insertAnswersQuery};`)
        if (rows[1]?.length > 0) {
          contract.answers = rows[1].map(convertAnswer)
        }
        await runTxnOutsideBetQueue(tx, {
          fromId: providerId,
          fromType: 'USER',
          toId: contract.id,
          toType: 'CONTRACT',
          amount: ante,
          token: 'M$',
          category: 'CREATE_CONTRACT_ANTE',
        })
        await generateAntes(tx, providerId, contract, ante, ante)
        return contract
      })

      await Promise.allSettled(
        params.groupIds.map((gId) =>
          pg.oneOrNone<{ id: string; slug: string }>(
            `select id, slug from groups where id = $1 limit 1`,
            [gId]
          ).then((g) => (g ? addGroupToContract(pg, result, g) : null))
        )
      )

      // Generate feed embeddings so the market shows up in personalized feeds
      // and the related-markets cache. Non-fatal if it fails.
      await generateContractEmbeddings(result, pg).catch(() => undefined)

      // Mirror the canonical create-market side-effects (follow, quest, group
      // embeddings; follower notifications stay off for the batch cron). The
      // market already exists at this point, so these are best-effort and
      // non-fatal — same treatment as the embeddings call above.
      await runSportsMarketPostCreate(pg, result, creatorUser, {
        notifyFollowers: opts.notifyFollowers ?? false,
      }).catch(() => undefined)

      created++
      log.push({ question: params.question, result: result.id, status: 'created' })
    } catch (e) {
      errors++
      log.push({
        question: params.question ?? matchLabel,
        result: e instanceof Error ? e.message : String(e),
        status: 'error',
      })
    }
  }

  return { created, skipped, errors, log }
}

// ─── Live scores ────────────────────────────────────────────────────────────────

export interface LiveMatchScore {
  sportsEventId: string
  homeScore: number | null
  awayScore: number | null
  status: string
  minute: string | null
}

const LIVE_ACTIVE_WINDOW_MS = 3 * 60 * 60 * 1000 // only poll within ±3h of a match

// True if this tournament has any unresolved market whose close time is within
// the active window of now — i.e. a match is plausibly in play. Lets the poller
// skip the football-data call entirely outside match windows to conserve quota.
export async function hasMatchInActiveWindow(
  config: TournamentConfig,
  pg: SupabaseDirectClient
): Promise<boolean> {
  const now = Date.now()
  const row = await pg.oneOrNone<{ count: string }>(
    `select count(*) as count from contracts
     where data->>'sportsLeague' = $1
       and token = 'MANA'
       and resolution is null
       and (data->>'closeTime')::bigint between $2 and $3`,
    [config.sportsLeague, now - LIVE_ACTIVE_WINDOW_MS, now + LIVE_ACTIVE_WINDOW_MS]
  )
  return Number(row?.count ?? 0) > 0
}

// One pull per tick during a tournament's active window that does everything:
// pushes live scores for in-progress matches over the websocket, clears the live
// banner for finished ones, and resolves them in the same pass (resolution lands
// within ~10s of full time, vs. up to 15 min on the backstop cron). No-op outside
// active windows. Only touches unresolved MANA markets keyed by sportsEventId, so
// community markets (which carry no sportsEventId) are never affected.
export async function pollAndStoreLiveScores(
  config: TournamentConfig,
  apiKey: string
): Promise<{ updated: number; resolved: number; polled: boolean }> {
  const pg = createSupabaseDirectClient()
  if (!(await hasMatchInActiveWindow(config, pg)))
    return { updated: 0, resolved: 0, polled: false }

  // Fetch a tight date window rather than only status=IN_PLAY, so the same pull
  // also sees PAUSED (half-time) and the FINISHED transition it needs for
  // live-clearing + resolution. Still one football-data call.
  const dayMs = 24 * 60 * 60 * 1000
  const matches = await fetchAllCompetitionMatches(config, apiKey, {
    dateFrom: isoDateStr(new Date(Date.now() - dayMs)),
    dateTo: isoDateStr(new Date(Date.now() + dayMs)),
  })
  const updatedTime = Date.now()
  let updated = 0

  for (const m of matches) {
    const status = m.status
    const isLive = status === 'IN_PLAY' || status === 'PAUSED'
    const isTerminal = status === 'FINISHED' || status === 'AWARDED'
    if (!isLive && !isTerminal) continue

    const patch = {
      sportsHomeScore: m.score.fullTime.home,
      sportsAwayScore: m.score.fullTime.away,
      sportsLiveStatus: status,
      // half-time break is reported as PAUSED (no HALF_TIME status); show "HT".
      sportsLiveMinute: isLive
        ? status === 'PAUSED'
          ? 'HT'
          : m.minute != null
          ? String(m.minute)
          : null
        : null,
      sportsLiveUpdatedTime: updatedTime,
    }

    if (isLive) {
      // Capture each contract's prior score in the SAME statement that overwrites
      // it, so we can diff for goals. Writing the new score here is also what
      // dedups annotations: next poll sees old == new and detects no goal.
      const rows = await pg.manyOrNone<{
        id: string
        old_home: number | null
        old_away: number | null
      }>(
        `with prev as (
           select id,
                  (data->>'sportsHomeScore')::int as old_home,
                  (data->>'sportsAwayScore')::int as old_away
           from contracts
           where data->>'sportsEventId' = $2
             and data->>'sportsLeague' = $3
             and token = 'MANA'
             and resolution is null
         )
         update contracts c set data = c.data || $1::jsonb
         from prev where c.id = prev.id
         returning c.id, prev.old_home, prev.old_away`,
        [JSON.stringify(patch), sportsEventId(m), config.sportsLeague]
      )
      updated += rows.length
      // In-memory fan-out to every open dashboard — viewer-count-independent.
      for (const row of rows) broadcastSportsLiveScore(row.id, patch)
      // Detect goals (score deltas) and back-date a marker onto the price spike.
      // Off the hot path unless a score actually changed.
      await annotateScoreChanges(
        pg,
        config,
        m,
        rows.map((r) => ({
          contractId: r.id,
          oldHome: r.old_home,
          oldAway: r.old_away,
        })),
        updatedTime
      ).catch((e) => logger.error(`annotateScoreChanges failed: ${e}`))
    } else {
      // Terminal: tell dashboards the match is over (status is not live) so they
      // clear the live banner immediately; resolution + the final score follow
      // from the resolve pass below + the next dashboard refetch.
      const rows = await pg.manyOrNone<{ id: string }>(
        `select id from contracts
         where data->>'sportsEventId' = $1
           and data->>'sportsLeague' = $2
           and token = 'MANA'
           and resolution is null`,
        [sportsEventId(m), config.sportsLeague]
      )
      for (const row of rows) broadcastSportsLiveScore(row.id, patch)
    }
  }

  // Resolve finished/awarded matches in the same pass (within ~10s of FT). The
  // 15-min sports-resolve cron remains a backstop for anything missed here.
  const terminal = matches.filter(
    (m) => m.status === 'FINISHED' || m.status === 'AWARDED'
  )
  let resolved = 0
  if (terminal.length > 0) {
    const r = await resolveTournamentMarketsForMatches(config, terminal)
    resolved = r.resolved
  }

  return { updated, resolved, polled: true }
}
