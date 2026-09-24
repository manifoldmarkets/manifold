/**
 * The Odds API pipeline: create a moneyline market per game for every
 * competition in the sports calendar, keep the score on the market while the
 * game is on, and resolve it from the final.
 *
 * State lives on the contracts themselves. `sportsEventId` is
 * `odds:<sport key>:<event id>`, so dedupe is a lookup on that field and the
 * resolver knows which sport to poll from the field alone. There is no
 * separate registry to keep in sync.
 */

import { groupBy, uniq } from 'lodash'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { contractColumnsToSelect, getUser, isProd, log } from 'shared/utils'
import { anythingToRichText } from 'shared/tiptap'
import { convertAnswer, convertContract } from 'common/supabase/contracts'
import { resolveMarketHelper } from 'shared/resolve-market-helpers'
import { publishSportsLiveScore } from 'shared/publish-sports-live-score'
import {
  createSportsContract,
  ensureOfficialGroup,
  findSportsMoneyline,
  SportsMarketAlreadyExistsError,
} from 'shared/sports-markets'
import { getScores, getUpcomingOdds } from 'shared/the-odds-api-client'
import { manifoldSportsUserId, MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import {
  calendarEntriesFor,
  calendarEntriesOverlapping,
  phaseWindow,
  SPORT_ID_TO_SPORT_KEY,
} from 'common/sports-calendar'
import {
  buildOddsMarketParams,
  gameResolution,
  OddsApiScore,
  OddsMarketParams,
  parseOddsEventId,
  teamScores,
  winningSide,
} from 'common/odds-markets'
import { sportTagIds } from 'common/sports-schedule'
import { CPMMMultiContract, MarketContract } from 'common/contract'
import { User } from 'common/user'
import { HOUR_MS, MINUTE_MS } from 'common/util/time'

const ROLLING_WINDOW_DAYS = 14
/** The most the Odds API will look back for completed games. */
const LOOKBACK_DAYS = 3
const LIQUIDITY_TIER = 1000
/**
 * New markets per competition per run, soonest games first. Caps the ante a
 * single run or admin click commits and how many markets land in the feed at
 * once; a longer backlog, like a season's first two weeks, fills in over the
 * next daily runs.
 */
export const MAX_NEW_MARKETS_PER_RUN = 25
/** An unresolved game this long after close gets an error log. */
const ATTENTION_AFTER_MS = 3 * HOUR_MS
/** The resolve job's cadence in backend/scheduler/src/jobs/index.ts. */
const RESOLVE_TICK_MS = 5 * MINUTE_MS

// ─── Creating markets ─────────────────────────────────────────────────────────

export type OddsCreateStatus = 'created' | 'skipped' | 'dry-run' | 'error'

export interface OddsCreateResult {
  created: number
  skipped: number
  errors: number
  log: {
    eventId: string
    question: string
    status: OddsCreateStatus
    reason: string | null
  }[]
}

async function sportsCreator(): Promise<User> {
  const id = manifoldSportsUserId(isProd())
  const user = await getUser(id)
  if (!user) throw new Error(`@ManifoldSports user ${id} not found`)
  return user
}

/**
 * Create the missing markets for one competition's upcoming games. Games are
 * taken from the Odds API for the next two weeks and kept only if they fall
 * inside one of the competition's auto-create phases, so a shared sport key
 * (the NFL regular season and playoffs share one) never creates the wrong
 * phase's games.
 */
export async function createOddsMarketsForCompetition(
  pg: SupabaseDirectClient,
  competitionId: string,
  opts: { dryRun?: boolean; creator?: User } = {}
): Promise<OddsCreateResult> {
  const phases = calendarEntriesFor(competitionId)
  const entry = phases[0]
  if (!entry) throw new Error(`No sports calendar entry for ${competitionId}`)
  if (!entry.oddsKey) {
    throw new Error(
      `${competitionId} has no Odds API sport key; create by hand`
    )
  }
  const windows = phases.filter((p) => p.autoCreate).map(phaseWindow)
  const result: OddsCreateResult = {
    created: 0,
    skipped: 0,
    errors: 0,
    log: [],
  }
  if (windows.length === 0) return result

  // Only games that have not started: the odds endpoint also returns games
  // in play, and a market opened from a live line is not a market.
  const now = Date.now()
  const events = (await getUpcomingOdds(entry.oddsKey, ROLLING_WINDOW_DAYS))
    .filter((e) => {
      const t = new Date(e.commence_time).getTime()
      return t > now && windows.some((w) => t >= w.from && t <= w.to)
    })
    .sort((a, b) => Date.parse(a.commence_time) - Date.parse(b.commence_time))
  if (events.length === 0) return result
  let planned = 0

  // A preview only reads provider events and existing markets. Delay group
  // creation/privacy changes and the creator lookup until a real insertion.
  let creator = opts.creator
  let groupIds: string[] | undefined

  for (const event of events) {
    let question = `${event.home_team} vs ${event.away_team}`
    try {
      const params = buildOddsMarketParams(event, entry)
      question = params.question
      const existing = await findSportsMoneyline(pg, params.sportsEventId)
      if (existing) {
        const moved = await resyncKickoff(pg, existing.id, params, {
          dryRun: opts.dryRun,
        })
        result.skipped++
        result.log.push({
          eventId: event.id,
          question: params.question,
          status: 'skipped',
          reason: moved
            ? `market ${existing.id} already exists; ${
                opts.dryRun ? 'would move' : 'moved'
              } its kickoff to ${params.sportsStartTimestamp}`
            : `market ${existing.id} already exists`,
        })
        continue
      }
      const answerProbs = params.answerProbs
      if (!answerProbs) {
        // A game with no line would open level with the full ante behind it.
        // The daily run looks again tomorrow, well inside the window.
        result.skipped++
        result.log.push({
          eventId: event.id,
          question: params.question,
          status: 'skipped',
          reason: 'no moneyline yet; the next daily run will try again',
        })
        continue
      }
      if (planned >= MAX_NEW_MARKETS_PER_RUN) {
        result.skipped++
        result.log.push({
          eventId: event.id,
          question: params.question,
          status: 'skipped',
          reason: `${MAX_NEW_MARKETS_PER_RUN} new markets is the most one run creates; the next run continues`,
        })
        continue
      }
      planned++
      if (opts.dryRun) {
        result.log.push({
          eventId: event.id,
          question: params.question,
          status: 'dry-run',
          reason: `would open at ${params.answers
            .map((a, i) => `${a} ${Math.round(answerProbs[i])}%`)
            .join(', ')}`,
        })
        continue
      }
      creator ??= await sportsCreator()
      if (!groupIds) {
        const group = await ensureOfficialGroup(
          {
            officialGroupSlug: `ms-official-${competitionId}`,
            officialGroupName: `MS Official: ${entry.competition}`,
            name: entry.competition,
          },
          creator.id,
          pg
        )
        groupIds = uniq([
          group.id,
          ...sportTagIds(SPORT_ID_TO_SPORT_KEY[entry.sport]),
        ])
      }
      const contract = await createSportsContract(
        pg,
        creator,
        {
          question: params.question,
          outcomeType: params.outcomeType,
          description:
            anythingToRichText({ markdown: params.description }) ??
            anythingToRichText({ raw: '' })!,
          closeTime: params.closeTime,
          liquidityTier: LIQUIDITY_TIER,
          answers: params.answers,
          answerProbs: params.answerProbs,
          answerShortTexts: params.answerShortTexts,
          sportsStartTimestamp: params.sportsStartTimestamp,
          sportsEventId: params.sportsEventId,
          sportsLeague: params.sportsLeague,
          sportsHomeTeam: params.sportsHomeTeam,
          sportsAwayTeam: params.sportsAwayTeam,
          sportsMarketType: params.sportsMarketType,
          groupIds,
        },
        { deduplicateMoneyline: true }
      )
      result.created++
      result.log.push({
        eventId: event.id,
        question: params.question,
        status: 'created',
        reason: contract.id,
      })
    } catch (e) {
      const duplicate = e instanceof SportsMarketAlreadyExistsError
      if (duplicate) result.skipped++
      else result.errors++
      result.log.push({
        eventId: event.id,
        question,
        status: duplicate ? 'skipped' : 'error',
        reason: e instanceof Error ? e.message : String(e),
      })
    }
  }
  return result
}

/**
 * A game the provider has moved keeps its market, with the new kickoff and
 * close time written onto it, so trading closes, the live window opens and
 * the resolver polls at the real time. True if the kickoff changed.
 */
async function resyncKickoff(
  pg: SupabaseDirectClient,
  contractId: string,
  params: OddsMarketParams,
  opts: { dryRun?: boolean }
): Promise<boolean> {
  const row = await pg.oneOrNone<{
    start: string | null
    resolution: string | null
  }>(
    `select data->>'sportsStartTimestamp' as start, resolution
     from contracts where id = $1`,
    [contractId]
  )
  if (!row || row.resolution) return false
  if (Date.parse(row.start ?? '') === Date.parse(params.sportsStartTimestamp))
    return false
  if (!opts.dryRun) {
    await pg.none(
      `update contracts set data = data || $1::jsonb
       where id = $2 and resolution is null`,
      [
        JSON.stringify({
          sportsStartTimestamp: params.sportsStartTimestamp,
          closeTime: params.closeTime,
        }),
        contractId,
      ]
    )
    log(
      `[sports-odds-create] ${contractId}: kickoff moved from ${row.start} to ${params.sportsStartTimestamp}`
    )
  }
  return true
}

/** The daily job. */
export async function createOddsMarketsForActiveCalendar(
  pg: SupabaseDirectClient
): Promise<Record<string, OddsCreateResult>> {
  // Any competition with an auto-create phase inside the rolling window, so
  // opening night gets its markets two weeks out and not the morning of.
  const now = Date.now()
  const competitionIds = uniq(
    calendarEntriesOverlapping(
      now,
      now + ROLLING_WINDOW_DAYS * 24 * 60 * 60 * 1000
    )
      .filter((e) => e.autoCreate && e.oddsKey)
      .map((e) => e.competitionId)
  )
  const creator = await sportsCreator()
  const out: Record<string, OddsCreateResult> = {}
  for (const competitionId of competitionIds) {
    try {
      out[competitionId] = await createOddsMarketsForCompetition(
        pg,
        competitionId,
        {
          creator,
        }
      )
    } catch (e) {
      log(`[sports-odds-create] ${competitionId}: ${e}`)
    }
  }
  return out
}

// ─── Live scores and resolution ───────────────────────────────────────────────

interface PendingGame {
  contract: MarketContract
  sportKey: string
  eventId: string
  startTime: number
}

/**
 * One pass over every unresolved Odds API game that has started: write the
 * score onto the market while it is on (the page shows it live), and resolve
 * it once the provider marks it completed. One `/scores` call per sport that
 * has such a game, none otherwise.
 */
export async function pollOddsScoresAndResolve(
  pg: SupabaseDirectClient
): Promise<{
  live: number
  resolved: number
  pending: number
  errors: number
}> {
  const now = Date.now()
  const rows = await pg.manyOrNone(
    `select ${contractColumnsToSelect}
     from contracts
     where creator_id = any($1)
       and token = 'MANA'
       and resolution is null
       and data->>'sportsEventId' like 'odds:%'
       and close_time > now() - ($2 || ' days')::interval
       and close_time < now() + interval '8 hours'`,
    [MANIFOLD_SPORTS_USER_IDS, String(LOOKBACK_DAYS)]
  )
  const pending: PendingGame[] = []
  for (const row of rows) {
    const contract = convertContract(row) as MarketContract
    const d = contract as any
    const parsed = parseOddsEventId(d.sportsEventId)
    const startTime = Date.parse(d.sportsStartTimestamp ?? '')
    if (!parsed || !Number.isFinite(startTime) || startTime > now) continue
    pending.push({ contract, ...parsed, startTime })
  }
  const stats = { live: 0, resolved: 0, pending: 0, errors: 0 }
  if (pending.length === 0) return stats

  const creator = await sportsCreator()
  const bySport = groupBy(pending, (p) => p.sportKey)
  const resolved = new Set<string>()
  for (const [sportKey, games] of Object.entries(bySport)) {
    let scores: OddsApiScore[]
    try {
      scores = await getScores(sportKey, LOOKBACK_DAYS)
    } catch (e) {
      log(`[sports-odds-resolve] scores for ${sportKey} failed: ${e}`)
      stats.errors += games.length
      continue
    }
    const scoreById = new Map(scores.map((s) => [s.id, s]))
    for (const game of games) {
      const score = scoreById.get(game.eventId)
      if (!score) {
        stats.pending++
        continue
      }
      try {
        if (score.completed) {
          await finishGame(pg, game, score, creator)
          resolved.add(game.contract.id)
          stats.resolved++
        } else if (score.scores && score.scores.length > 0) {
          await writeLiveScore(pg, game, score, now)
          stats.live++
        } else {
          stats.pending++
        }
      } catch (e) {
        log(`[sports-odds-resolve] ${game.contract.id}: ${e}`)
        stats.errors++
      }
    }
  }
  for (const game of pending) {
    if (!resolved.has(game.contract.id)) alertIfOverdue(game, now)
  }
  return stats
}

/**
 * An error log, once an hour, for a game still unresolved three hours after
 * close: a postponement, a provider outage, an exhausted quota or a name
 * mismatch. The resolver stops looking three days after close, so these need
 * a person.
 */
function alertIfOverdue(game: PendingGame, now: number) {
  const { closeTime, id, question } = game.contract
  if (!closeTime) return
  const overdue = now - closeTime - ATTENTION_AFTER_MS
  if (overdue < 0 || overdue % HOUR_MS >= RESOLVE_TICK_MS) return
  log.error(
    `[sports-odds-resolve] ${id} ("${question}") is unresolved ${Math.floor(
      (now - closeTime) / HOUR_MS
    )}h after close; the resolver gives up ${LOOKBACK_DAYS} days after close. Resolve it by hand if the game was postponed or cancelled.`
  )
}

async function writeLiveScore(
  pg: SupabaseDirectClient,
  game: PendingGame,
  score: OddsApiScore,
  now: number
) {
  const { home, away } = teamScores(score)
  const patch = {
    sportsHomeScore: home,
    sportsAwayScore: away,
    sportsLiveStatus: 'IN_PLAY',
    // The Odds API has no clock; the page shows "LIVE" without a minute.
    sportsLiveMinute: null,
    sportsLiveUpdatedTime: now,
  }
  await pg.none(`update contracts set data = data || $1::jsonb where id = $2`, [
    JSON.stringify(patch),
    game.contract.id,
  ])
  await publishSportsLiveScore(game.contract.id, patch)
}

async function finishGame(
  pg: SupabaseDirectClient,
  game: PendingGame,
  score: OddsApiScore,
  creator: User
) {
  const { contract } = game
  const d = contract as any
  const side = winningSide(score)
  const { home, away } = teamScores(score)
  if (side === null || home == null || away == null) {
    throw new Error(`completed game ${game.eventId} has no scores`)
  }

  // Tell the page the game is over before resolving, so the live badge clears
  // even if resolution throws.
  const patch = {
    sportsHomeScore: home,
    sportsAwayScore: away,
    sportsLiveStatus: 'FINISHED',
    sportsLiveMinute: null,
    sportsLiveUpdatedTime: Date.now(),
  }
  await pg.none(`update contracts set data = data || $1::jsonb where id = $2`, [
    JSON.stringify(patch),
    contract.id,
  ])
  await publishSportsLiveScore(contract.id, patch)

  if (contract.mechanism === 'cpmm-1') {
    // Binary game markets (before the switch to versus markets): YES is the
    // home team, NO the away team, and a tie pays out at 50%.
    const args =
      side === 'home'
        ? { outcome: 'YES' }
        : side === 'away'
        ? { outcome: 'NO' }
        : { outcome: 'MKT', probabilityInt: 50 }
    await resolveMarketHelper(contract, creator, creator, args)
    return
  }

  const answers = (
    await pg.manyOrNone(`select * from answers where contract_id = $1`, [
      contract.id,
    ])
  ).map(convertAnswer)
  const args = gameResolution(answers, side, d.sportsHomeTeam, d.sportsAwayTeam)
  if (!args) {
    throw new Error(
      `answers on ${contract.id} don't look like a game: ${answers
        .map((a) => a.text)
        .join(', ')}`
    )
  }
  const multi = { ...(contract as CPMMMultiContract), answers }
  await resolveMarketHelper(multi, creator, creator, args)
}
