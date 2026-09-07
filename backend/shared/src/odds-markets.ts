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
import { broadcastSportsLiveScore } from 'shared/websockets/helpers'
import {
  createSportsContract,
  ensureOfficialGroup,
} from 'shared/sports-markets'
import { getScores, getUpcomingOdds } from 'shared/the-odds-api-client'
import { manifoldSportsUserId, MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import {
  activeCalendarEntries,
  calendarEntriesFor,
  SPORT_ID_TO_SPORT_KEY,
  SportsCalendarEntry,
} from 'common/sports-calendar'
import {
  buildOddsMarketParams,
  DRAW_ANSWER,
  OddsApiScore,
  parseOddsEventId,
  resolveWinner,
  teamScores,
} from 'common/odds-markets'
import { sportTagIds } from 'common/sports-schedule'
import { CPMMMultiContract, MarketContract } from 'common/contract'
import { User } from 'common/user'

const ROLLING_WINDOW_DAYS = 14
/** The most the Odds API will look back for completed games. */
const LOOKBACK_DAYS = 3
const LIQUIDITY_TIER = 1000
const HOUR_MS = 60 * 60 * 1000

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
  const windows = phases
    .filter((p) => p.autoCreate)
    .map((p) => ({
      from: new Date(`${p.startDate}T00:00:00Z`).getTime(),
      to: new Date(`${p.endDate}T23:59:59Z`).getTime(),
    }))
  const result: OddsCreateResult = {
    created: 0,
    skipped: 0,
    errors: 0,
    log: [],
  }
  if (windows.length === 0) return result

  const events = (
    await getUpcomingOdds(entry.oddsKey, ROLLING_WINDOW_DAYS)
  ).filter((e) => {
    const t = new Date(e.commence_time).getTime()
    return windows.some((w) => t >= w.from && t <= w.to)
  })
  if (events.length === 0) return result

  const creator = opts.creator ?? (await sportsCreator())
  const group = await ensureOfficialGroup(
    {
      officialGroupSlug: `ms-official-${competitionId}`,
      officialGroupName: `MS Official: ${entry.competition}`,
      name: entry.competition,
    },
    creator.id,
    pg
  )
  // The sport's own topics too, so /browse, the topic pages and the sports
  // page all see the market.
  const groupIds = uniq([
    group.id,
    ...sportTagIds(SPORT_ID_TO_SPORT_KEY[entry.sport]),
  ])

  for (const event of events) {
    const params = buildOddsMarketParams(event, entry)
    const existing = await pg.oneOrNone<{ id: string }>(
      `select id from contracts where data->>'sportsEventId' = $1 limit 1`,
      [params.sportsEventId]
    )
    if (existing) {
      result.skipped++
      result.log.push({
        eventId: event.id,
        question: params.question,
        status: 'skipped',
        reason: `market ${existing.id} already exists`,
      })
      continue
    }
    if (opts.dryRun) {
      result.log.push({
        eventId: event.id,
        question: params.question,
        status: 'dry-run',
        reason:
          params.outcomeType === 'BINARY'
            ? `would open at ${params.initialProb}% for ${params.sportsHomeTeam}`
            : 'would open three-way (home, away, Draw)',
      })
      continue
    }
    try {
      const contract = await createSportsContract(pg, creator, {
        question: params.question,
        outcomeType: params.outcomeType,
        description:
          anythingToRichText({ markdown: params.description }) ??
          anythingToRichText({ raw: '' })!,
        initialProb: params.initialProb,
        closeTime: params.closeTime,
        liquidityTier: LIQUIDITY_TIER,
        answers: params.answers,
        sportsStartTimestamp: params.sportsStartTimestamp,
        sportsEventId: params.sportsEventId,
        sportsLeague: params.sportsLeague,
        sportsHomeTeam: params.sportsHomeTeam,
        sportsAwayTeam: params.sportsAwayTeam,
        sportsMarketType: params.sportsMarketType,
        groupIds,
      })
      result.created++
      result.log.push({
        eventId: event.id,
        question: params.question,
        status: 'created',
        reason: contract.id,
      })
    } catch (e) {
      result.errors++
      result.log.push({
        eventId: event.id,
        question: params.question,
        status: 'error',
        reason: e instanceof Error ? e.message : String(e),
      })
    }
  }
  return result
}

/** The daily job: every competition in an active auto-create phase with a sport key. */
export async function createOddsMarketsForActiveCalendar(
  pg: SupabaseDirectClient
): Promise<Record<string, OddsCreateResult>> {
  const competitionIds = uniq(
    activeCalendarEntries()
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
  return stats
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
  broadcastSportsLiveScore(game.contract.id, patch)
}

async function finishGame(
  pg: SupabaseDirectClient,
  game: PendingGame,
  score: OddsApiScore,
  creator: User
) {
  const { contract } = game
  const d = contract as any
  const homeTeam: string = d.sportsHomeTeam ?? score.home_team
  const awayTeam: string = d.sportsAwayTeam ?? score.away_team
  const winner = resolveWinner(score) // null: tie, or no usable score
  const { home, away } = teamScores(score)
  if (home == null || away == null) {
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
  broadcastSportsLiveScore(contract.id, patch)

  if (contract.mechanism === 'cpmm-1') {
    // YES is the home team, NO the away team, a tie pays out at 50%.
    const args =
      winner === null
        ? { outcome: 'MKT', probabilityInt: 50 }
        : winner === homeTeam
        ? { outcome: 'YES' }
        : winner === awayTeam
        ? { outcome: 'NO' }
        : null
    if (!args) {
      throw new Error(
        `winner "${winner}" matches neither ${homeTeam} nor ${awayTeam}`
      )
    }
    await resolveMarketHelper(contract, creator, creator, args)
    return
  }

  {
    const answers = (
      await pg.manyOrNone(`select * from answers where contract_id = $1`, [
        contract.id,
      ])
    ).map(convertAnswer)
    const wanted = winner ?? DRAW_ANSWER
    const winning = answers.find(
      (a) => a.text.trim().toLowerCase() === wanted.trim().toLowerCase()
    )
    if (!winning) {
      throw new Error(`no answer named "${wanted}" on ${contract.id}`)
    }
    const multi = { ...(contract as CPMMMultiContract), answers }
    await resolveMarketHelper(multi, creator, creator, {
      outcome: winning.id,
      resolutions: { [winning.id]: 100 },
    })
  }
}

/** Kept for the admin page: which calendar entries the daily job would act on right now. */
export function oddsCompetitionsDue(now = Date.now()): SportsCalendarEntry[] {
  return activeCalendarEntries(now).filter((e) => e.autoCreate && !!e.oddsKey)
}

export { HOUR_MS as ODDS_HOUR_MS }
