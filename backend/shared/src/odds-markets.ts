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
  SportsGameStartedError,
  SportsMarketAlreadyExistsError,
} from 'shared/sports-markets'
import { getScores, getUpcomingOdds } from 'shared/the-odds-api-client'
import { manifoldSportsUserId, MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import { getCompetitionSwitches } from 'shared/supabase/sports-competition-switches'
import { getScorePollingSettings } from 'shared/supabase/sports-score-polling'
import { LEGACY_OFFICIAL_SUFFIX } from 'common/sports-league-label'
import {
  finalsOnlySettings,
  liveInterval,
  ScorePollingSettings,
  scorePollPlan,
  sportForLeague,
} from 'common/sports-score-polling'
import {
  autoCreates,
  calendarEntriesFor,
  calendarEntriesOverlapping,
  CompetitionSwitches,
  phaseWindow,
  SPORT_ID_TO_SPORT_KEY,
  SPORT_LEAGUE_LABEL,
  SPORTS_CALENDAR,
} from 'common/sports-calendar'
import {
  buildOddsMarketParams,
  canEndLevel,
  gameResolution,
  GameTeams,
  OddsApiScore,
  OddsMarketParams,
  parseOddsEventId,
  teamScores,
  winningSide,
} from 'common/odds-markets'
import { sportTagIds } from 'common/sports-schedule'
import {
  CPMMMultiContract,
  MarketContract,
  MULTI_CPMM_MECHANISMS_SQL,
} from 'common/contract'
import { User } from 'common/user'
import { APIError } from 'common/api/utils'
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
/**
 * A game kicking off sooner than this isn't created: a pregame line that
 * close to kickoff isn't worth opening, and the margin covers the time a run
 * takes and clock drift between us and the provider.
 */
const MIN_CREATE_LEAD_MS = 5 * MINUTE_MS

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
 * taken from the Odds API for the next two weeks. A game is created only if
 * it falls inside one of the competition's switched-on phases (`switches`,
 * falling back to each phase's default) and outside every phase on the same
 * feed that's off, so a shared sport key (the NFL regular season and
 * playoffs share one; the CFP window overlaps the bowls') never creates a
 * phase's games while it's off. A game that already has a market is kept in
 * sync with the provider's kickoff whether or not its phase is still on.
 * `eventIds` narrows the run to the games an admin picked from a dry run;
 * the other checks still apply.
 */
export async function createOddsMarketsForCompetition(
  pg: SupabaseDirectClient,
  competitionId: string,
  opts: {
    dryRun?: boolean
    creator?: User
    eventIds?: string[]
    switches?: CompetitionSwitches
  } = {}
): Promise<OddsCreateResult> {
  const phases = calendarEntriesFor(competitionId)
  const entry = phases[0]
  if (!entry) throw new Error(`No sports calendar entry for ${competitionId}`)
  if (!entry.oddsKey) {
    throw new Error(
      `${competitionId} has no Odds API sport key; create by hand`
    )
  }
  const switches = opts.switches ?? {}
  // Every phase a market could have been made in: a market that exists is
  // re-synced to the provider's kickoff even after its phase is switched off,
  // so a postponed game still closes and resolves at the real time.
  const syncWindows = phases.filter((p) => !p.locked).map(phaseWindow)
  const createWindows = phases
    .filter((p) => autoCreates(p, switches))
    .map(phaseWindow)
  // Phases on this feed where creation is off. The provider files a feed's
  // games under one key, so a game inside an off phase's dates isn't created
  // even when another phase's dates cover it too: off means off.
  const offPhases = SPORTS_CALENDAR.filter(
    (p) => p.oddsKey === entry.oddsKey && !autoCreates(p, switches)
  )
  const result: OddsCreateResult = {
    created: 0,
    skipped: 0,
    errors: 0,
    log: [],
  }
  if (syncWindows.length === 0) return result

  // Only games that haven't started: the odds endpoint also returns games in
  // play, and a market opened from a live line is not a market. The clock is
  // read after the fetch returns. Games kicking off within MIN_CREATE_LEAD_MS
  // stay in, because an existing market still has to re-sync to a kickoff
  // the provider moved earlier; the lead only stops new markets, checked
  // before each game is created and again inside its transaction.
  const picked = opts.eventIds ? new Set(opts.eventIds) : undefined
  const fetched = await getUpcomingOdds(entry.oddsKey, ROLLING_WINDOW_DAYS)
  const now = Date.now()
  const inWindow = (t: number, w: { from: number; to: number }) =>
    t >= w.from && t <= w.to
  const events = fetched
    .filter((e) => {
      const t = new Date(e.commence_time).getTime()
      return t > now && syncWindows.some((w) => inWindow(t, w))
    })
    .filter((e) => !picked || picked.has(e.id))
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
          titleFor: (start) =>
            buildOddsMarketParams({ ...event, commence_time: start }, entry)
              .question,
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
      // In a phase that's off, this competition's or another's on the same
      // feed: not created, and the dry run says which.
      const start = Date.parse(params.sportsStartTimestamp)
      const offPhase = offPhases.find((p) => inWindow(start, phaseWindow(p)))
      if (offPhase || !createWindows.some((w) => inWindow(start, w))) {
        result.skipped++
        result.log.push({
          eventId: event.id,
          question: params.question,
          status: 'skipped',
          reason: offPhase
            ? `${offPhase.competition}: ${offPhase.phase} is off`
            : 'outside the phases switched on',
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
      if (
        Date.parse(params.sportsStartTimestamp) <=
        Date.now() + MIN_CREATE_LEAD_MS
      ) {
        result.skipped++
        result.log.push({
          eventId: event.id,
          question: params.question,
          status: 'skipped',
          reason: 'kicks off too soon to open a market',
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
          ...sportTagIds(
            SPORT_ID_TO_SPORT_KEY[entry.sport],
            SPORT_LEAGUE_LABEL[entry.sport]
          ),
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
          answerColors: params.answerColors,
          sportsStartTimestamp: params.sportsStartTimestamp,
          sportsEventId: params.sportsEventId,
          sportsLeague: params.sportsLeague,
          sportsHomeTeam: params.sportsHomeTeam,
          sportsAwayTeam: params.sportsAwayTeam,
          sportsMarketType: params.sportsMarketType,
          groupIds,
        },
        { deduplicateMoneyline: true, minLeadMs: MIN_CREATE_LEAD_MS }
      )
      result.created++
      result.log.push({
        eventId: event.id,
        question: params.question,
        status: 'created',
        reason: contract.id,
      })
    } catch (e) {
      // Both are expected races, not failures: another run made the market,
      // or the game kicked off while this one was getting to it.
      const skipped =
        e instanceof SportsMarketAlreadyExistsError ||
        e instanceof SportsGameStartedError
      if (skipped) result.skipped++
      else result.errors++
      result.log.push({
        eventId: event.id,
        question,
        status: skipped ? 'skipped' : 'error',
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
  opts: {
    dryRun?: boolean
    /** The title the pipeline gives this game at a given kickoff. */
    titleFor: (start: string) => string
  }
): Promise<boolean> {
  const row = await pg.oneOrNone<{
    start: string | null
    resolution: string | null
    question: string | null
  }>(
    `select data->>'sportsStartTimestamp' as start, resolution, question
     from contracts where id = $1`,
    [contractId]
  )
  if (!row || row.resolution) return false
  if (Date.parse(row.start ?? '') === Date.parse(params.sportsStartTimestamp))
    return false
  // The date is in the title, so repeat fixtures differ. Move it with the
  // kickoff, but only while the title is still the one the pipeline wrote
  // (or wrote before it dropped "[official]"): an edited title stays. The
  // slug never changes.
  const pipelineTitle = row.start ? opts.titleFor(row.start) : undefined
  const retitle =
    !!pipelineTitle &&
    (row.question === pipelineTitle ||
      row.question === pipelineTitle + LEGACY_OFFICIAL_SUFFIX) &&
    params.question !== row.question
  if (!opts.dryRun) {
    await pg.none(
      `update contracts set data = data || $1::jsonb
       where id = $2 and resolution is null`,
      [
        JSON.stringify({
          sportsStartTimestamp: params.sportsStartTimestamp,
          closeTime: params.closeTime,
          ...(retitle ? { question: params.question } : {}),
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
  // The admin switches are the off switch for spending, so a run that can't
  // read them creates nothing: falling back to the calendar's defaults would
  // create games an admin switched off.
  let switches: CompetitionSwitches
  try {
    switches = await getCompetitionSwitches(pg)
  } catch (e) {
    log.error(
      `[sports-odds-create] couldn't read the switches, so this run creates nothing: ${e}`
    )
    return {}
  }
  // Feeds with a market the resolver still watches: their games are kept in
  // sync with the provider's kickoffs whether or not the phase is still on.
  let watchedKeys = new Set<string>()
  try {
    watchedKeys = new Set(
      await pg.map(
        `select distinct split_part(data->>'sportsEventId', ':', 2) as sport_key
           from contracts
          where creator_id = any($1)
            and resolution is null
            and data->>'sportsEventId' like 'odds:%'
            and close_time > now() - ($2 || ' days')::interval`,
        [MANIFOLD_SPORTS_USER_IDS, String(LOOKBACK_DAYS)],
        (r) => r.sport_key as string
      )
    )
  } catch (e) {
    log.error(
      `[sports-odds-create] couldn't list the feeds with open markets, so only switched-on phases run today: ${e}`
    )
  }
  // Any competition with a switched-on phase, or open markets, inside the
  // rolling window, so opening night gets its markets two weeks out and not
  // the morning of.
  const now = Date.now()
  const competitionIds = uniq(
    calendarEntriesOverlapping(
      now,
      now + ROLLING_WINDOW_DAYS * 24 * 60 * 60 * 1000
    )
      .filter(
        (e) =>
          !e.locked &&
          e.oddsKey !== undefined &&
          (autoCreates(e, switches) || watchedKeys.has(e.oddsKey))
      )
      .map((e) => e.competitionId)
  )
  const creator = await sportsCreator()
  const out: Record<string, OddsCreateResult> = {}
  for (const competitionId of competitionIds) {
    try {
      out[competitionId] = await createOddsMarketsForCompetition(
        pg,
        competitionId,
        { creator, switches }
      )
    } catch (e) {
      // An exhausted quota or a provider outage stops a whole competition:
      // an error, so it alerts.
      log.error(`[sports-odds-create] ${competitionId} didn't run: ${e}`)
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
 * What the resolver remembers between ticks: when it last asked for each
 * sport key's scores, how many of those calls failed in a row, which started
 * games have gone missing from the feed, and when it last reported each
 * overdue game, plus the markets still owned by an earlier tick. The scheduler
 * keeps one for its lifetime. Do not reset it to recover an uncertain mutation
 * until the old server work has been confirmed finished.
 */
export interface ScorePollState {
  /** Any /scores call per sport key. */
  lastPolled: Record<string, number>
  /** /scores calls that asked for finished games, per sport key. */
  lastFinished: Record<string, number>
  /** Failed /scores calls in a row per sport key; each doubles the wait. */
  failures: Record<string, number>
  /**
   * Started games absent from the feed even with finished games asked for
   * (postponed, cancelled or not yet filed), or completed but not resolvable
   * yet (a level final in a sport that can't end level), by contract id.
   * They get no live polls; their sport's finals checks keep asking for
   * finished games until they turn up or resolve.
   */
  missing: Record<string, number>
  lastOverdueAlert: Record<string, number>
  /** When the polling settings last failed to load; logged hourly. */
  lastSettingsError?: number
  /**
   * Per-market reservations shared by every tick in this scheduler process.
   * A deadline cannot release an issued mutation. Unknown mutation outcomes
   * stay reserved until an operator verifies server completion and restarts
   * the scheduler; see withGameReservation. This is not a distributed lock.
   */
  inFlight: Set<string>
}

export const newScorePollState = (): ScorePollState => ({
  lastPolled: {},
  lastFinished: {},
  failures: {},
  missing: {},
  lastOverdueAlert: {},
  inFlight: new Set(),
})

/**
 * One tick over every unresolved Odds API game that has started. Sport keys
 * are asked for scores only as often as /admin/sports says (live scores per
 * sport or game, and finals once a game is due to end; see
 * common/sports-score-polling.ts), one `/scores` call per key, none while
 * nothing is due. Live scores are written onto the markets that want them,
 * and a game is resolved once the provider marks it completed.
 */
/**
 * One resolver tick. `isCurrent` lets the scheduler abandon a run that has
 * overrun its deadline (a dead database connection held one for the full
 * 60-minute client timeout on 2026-10-17, four times): once it returns false
 * the run starts no further work. An already-issued mutation may still finish:
 * its market stays reserved across the deadline, while other markets proceed.
 * All scheduler ticks must share the same state (including reservations).
 */
export async function pollOddsScoresAndResolve(
  pg: SupabaseDirectClient,
  state: ScorePollState,
  isCurrent: () => boolean = () => true
): Promise<{
  polled: number
  live: number
  resolved: number
  pending: number
  errors: number
}> {
  const now = Date.now()
  // A read started while another run owns a market may return its old row
  // after that run has settled. Skip it for this whole tick, even if the
  // reservation is released before we get to the game; the next tick re-reads.
  const reservedAtStart = new Set(state.inFlight)
  const rows = await pg.manyOrNone(
    `select ${contractColumnsToSelect}
     from contracts
     where creator_id = any($1)
       and token = 'MANA'
       and resolution is null
       and data->>'sportsEventId' like 'odds:%'
       -- Game markets are multiple choice. Binary ones from an early build
       -- (dev only) are left for a person to resolve.
       and mechanism in ${MULTI_CPMM_MECHANISMS_SQL}
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
  const stats = { polled: 0, live: 0, resolved: 0, pending: 0, errors: 0 }
  if (!isCurrent()) return stats
  // Forget games the resolver no longer watches.
  const pendingIds = new Set(pending.map((game) => game.contract.id))
  for (const id of Object.keys(state.missing)) {
    if (!pendingIds.has(id)) delete state.missing[id]
  }
  if (pending.length === 0) return stats

  // The settings are the off switch for spending credits. A tick that can't
  // read them polls finals only, with live scores off for every sport, so
  // nothing an admin switched off runs and games still resolve; the next
  // tick, 10 seconds on, tries the read again.
  let settings: ScorePollingSettings
  try {
    settings = await getScorePollingSettings(pg)
  } catch (e) {
    if (!isCurrent()) return stats
    settings = finalsOnlySettings()
    if (now - (state.lastSettingsError ?? -Infinity) >= HOUR_MS) {
      state.lastSettingsError = now
      log.error(
        `[sports-odds-resolve] couldn't read the polling settings, so polling finals only: ${e}`
      )
    }
  }
  if (!isCurrent()) return stats
  const sportOf = (game: PendingGame) =>
    sportForLeague((game.contract as any).sportsLeague)
  const plan = scorePollPlan(
    pending
      .filter((game) => !reservedAtStart.has(game.contract.id))
      .map((game) => ({
        contractId: game.contract.id,
        sportKey: game.sportKey,
        sport: sportOf(game),
        startTime: game.startTime,
        closeTime: game.contract.closeTime,
        missing: game.contract.id in state.missing,
      })),
    settings,
    state.lastPolled,
    now,
    state.failures,
    state.lastFinished
  )

  const bySport = groupBy(pending, (p) => p.sportKey)
  const resolved = new Set<string>()
  const creator = plan.length > 0 ? await sportsCreator() : undefined
  if (!isCurrent()) return stats
  for (const { sportKey, withFinished } of plan) {
    if (!isCurrent()) return stats
    // Counted even if the call fails, so a failing provider is retried at
    // the set interval, doubled per failure in a row, not on every tick.
    state.lastPolled[sportKey] = now
    if (withFinished) state.lastFinished[sportKey] = now
    stats.polled++
    const games = (bySport[sportKey] ?? []).filter(
      (game) => !reservedAtStart.has(game.contract.id)
    )
    let scores: OddsApiScore[]
    try {
      scores = await getScores(
        sportKey,
        withFinished ? { finishedDays: LOOKBACK_DAYS } : {}
      )
      if (!isCurrent()) return stats
      delete state.failures[sportKey]
    } catch (e) {
      if (!isCurrent()) return stats
      state.failures[sportKey] = (state.failures[sportKey] ?? 0) + 1
      log(
        `[sports-odds-resolve] scores for ${sportKey} failed (${state.failures[sportKey]} in a row): ${e}`
      )
      stats.errors += games.length
      continue
    }
    // A started game absent from a live-only response has probably just
    // finished, however early: the provider only lists a completed game when
    // asked for finished ones. Ask now rather than at the finals check, so
    // the market resolves and stops trading on a known result. Games already
    // known to be missing (postponed, or completed but not resolvable) are
    // left to the finals check, so they don't add a call to every live poll.
    // If the follow-up call fails the live response still counts, and the
    // game is flagged below so the finals check takes it from there.
    if (!isCurrent()) return stats
    const listed = new Set(scores.map((s) => s.id))
    const dropped = games.some(
      (g) => !listed.has(g.eventId) && !(g.contract.id in state.missing)
    )
    if (!withFinished && dropped) {
      stats.polled++
      state.lastFinished[sportKey] = now
      try {
        scores = await getScores(sportKey, { finishedDays: LOOKBACK_DAYS })
      } catch (e) {
        if (!isCurrent()) return stats
        log(`[sports-odds-resolve] finished games for ${sportKey} failed: ${e}`)
      }
    }
    if (!isCurrent()) return stats
    const scoreById = new Map(scores.map((s) => [s.id, s]))
    for (const game of games) {
      if (!isCurrent()) return stats
      const id = game.contract.id
      if (reservedAtStart.has(id) || state.inFlight.has(id)) {
        stats.pending++
        continue
      }
      const score = scoreById.get(game.eventId)
      if (!score) {
        if (!(id in state.missing)) state.missing[id] = now
        stats.pending++
        continue
      }
      try {
        if (!isCurrent()) return stats
        if (score.completed) {
          await withGameReservation(state, id, isCurrent, (run) =>
            finishGame(pg, game, score, creator!, run)
          )
          if (!isCurrent()) return stats
          resolved.add(id)
          stats.resolved++
        } else if (
          score.scores &&
          score.scores.length > 0 &&
          liveInterval({ contractId: id, sport: sportOf(game) }, settings) > 0
        ) {
          await withGameReservation(state, id, isCurrent, (run) =>
            writeLiveScore(pg, game, score, now, run)
          )
          if (!isCurrent()) return stats
          stats.live++
        } else {
          stats.pending++
        }
        delete state.missing[id]
      } catch (e) {
        if (!isCurrent()) return stats
        // A completed game that can't be resolved (a level final in a sport
        // that can't end level, a team mismatch) counts as missing: no live
        // polls, and the finals check keeps asking for finished games, so it
        // isn't asked for twice on every live poll.
        if (score.completed && !(id in state.missing)) state.missing[id] = now
        log(`[sports-odds-resolve] ${id}: ${e}`)
        stats.errors++
      }
    }
  }
  if (!isCurrent()) return stats
  for (const game of pending) {
    if (!resolved.has(game.contract.id)) alertIfOverdue(game, state, now)
  }
  return stats
}

interface ScoreGameRun {
  isCurrent: () => boolean
  mutate: (
    work: () => Promise<unknown>,
    outcomeIsKnown?: () => boolean
  ) => Promise<void>
}

// These errors establish that the server rejected the command. pg-promise's
// tx() awaits ROLLBACK before returning the callback error, and replaces it
// with the rollback error if that fails. In particular, a client read timeout
// or connection loss is NOT evidence that the server stopped executing.
function mutationDefinitelyEnded(error: unknown) {
  if (error instanceof APIError) return true
  if (typeof error !== 'object' || error === null || !('code' in error))
    return false
  return [
    '40001',
    '40P01',
    '55P03',
    '57014',
    '23503',
    '23505',
    '23514',
  ].includes(String(error.code))
}

async function withGameReservation(
  state: ScorePollState,
  id: string,
  isCurrent: () => boolean,
  work: (run: ScoreGameRun) => Promise<void>
) {
  state.inFlight.add(id)
  let uncertainMutation = false
  try {
    await work({
      isCurrent,
      mutate: async (mutation, outcomeIsKnown) => {
        uncertainMutation = true
        try {
          await mutation()
          uncertainMutation = false
        } catch (error) {
          uncertainMutation =
            !outcomeIsKnown?.() && !mutationDefinitelyEnded(error)
          throw error
        }
      },
    })
  } finally {
    if (uncertainMutation) {
      // Keep this ERROR even for a stale run: suppressing it would leave a
      // market silently skipped forever. Never clear a reservation by timer.
      log.error(
        `[sports-odds-resolve] ${id}: mutation outcome unknown; automatic polling is suspended for this market in this process. Verify the old database work has ended and inspect the market before restarting the scheduler or resolving manually.`
      )
    } else {
      state.inFlight.delete(id)
    }
  }
}

/**
 * An error log, once an hour, for a game still unresolved three hours after
 * close: a postponement, a provider outage, an exhausted quota or a name
 * mismatch. The resolver stops looking three days after close, so these need
 * a person.
 */
function alertIfOverdue(game: PendingGame, state: ScorePollState, now: number) {
  const { closeTime, id, question } = game.contract
  if (!closeTime || now - closeTime < ATTENTION_AFTER_MS) return
  if (now - (state.lastOverdueAlert[id] ?? -Infinity) < HOUR_MS) return
  state.lastOverdueAlert[id] = now
  log.error(
    `[sports-odds-resolve] ${id} ("${question}") is unresolved ${Math.floor(
      (now - closeTime) / HOUR_MS
    )}h after close; the resolver gives up ${LOOKBACK_DAYS} days after close. Resolve it by hand if the game was postponed or cancelled.`
  )
}

// The two teams stored on the market when it was created.
function gameTeams(game: PendingGame): GameTeams {
  const d = game.contract as any
  return { home: d.sportsHomeTeam, away: d.sportsAwayTeam }
}

function teamMismatch(
  game: PendingGame,
  score: OddsApiScore,
  teams: GameTeams
) {
  return `[sports-odds-resolve] ${game.contract.id}: the score feed has ${score.home_team} v ${score.away_team} for event ${game.eventId}, but the market is ${teams.home} v ${teams.away}. Not scoring or resolving it; check the game and resolve it by hand.`
}

async function writeScorePatch(
  pg: SupabaseDirectClient,
  id: string,
  patch: Record<string, unknown>,
  run: ScoreGameRun
) {
  let issued = false
  await run.mutate(
    () =>
      // A task acquires a connection before entering this callback, without
      // adding a transaction. Acquisition failures cannot have sent this write.
      pg.task(async (task) => {
        if (!run.isCurrent()) return
        issued = true
        await task.none(
          `update contracts set data = data || $1::jsonb where id = $2`,
          [JSON.stringify(patch), id]
        )
      }),
    () => !issued
  )
}

async function writeLiveScore(
  pg: SupabaseDirectClient,
  game: PendingGame,
  score: OddsApiScore,
  now: number,
  run: ScoreGameRun
) {
  const teams = gameTeams(game)
  const scores = teamScores(score, teams)
  if (!scores) {
    log.error(teamMismatch(game, score, teams))
    return
  }
  const { home, away } = scores
  const patch = {
    sportsHomeScore: home,
    sportsAwayScore: away,
    sportsLiveStatus: 'IN_PLAY',
    // The Odds API has no clock; the page shows "LIVE" without a minute.
    sportsLiveMinute: null,
    sportsLiveUpdatedTime: now,
  }
  if (!run.isCurrent()) return
  await writeScorePatch(pg, game.contract.id, patch, run)
  if (!run.isCurrent()) return
  await run.mutate(() => publishSportsLiveScore(game.contract.id, patch))
}

async function finishGame(
  pg: SupabaseDirectClient,
  game: PendingGame,
  score: OddsApiScore,
  creator: User,
  run: ScoreGameRun
) {
  const { contract } = game
  const d = contract as any
  // Scores and the winner are read against the market's own home and away,
  // never the payload's, and a payload about other teams stops here.
  const teams = gameTeams(game)
  const scores = teamScores(score, teams)
  if (!scores) throw new Error(teamMismatch(game, score, teams))
  const side = winningSide(score, teams)
  const { home, away } = scores
  if (side === null || home == null || away == null) {
    throw new Error(`completed game ${game.eventId} has no scores`)
  }
  // A level final in a sport that plays on until someone wins is missing its
  // decider. Paying 50/50 would be wrong, so leave it for a person (and for a
  // corrected score on the next poll).
  if (side === 'tie' && !canEndLevel(game.sportKey)) {
    throw new Error(
      `${contract.id} finished level at ${home}–${away}, but ${game.sportKey} games can't end level; resolve by hand`
    )
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
  if (!run.isCurrent()) return
  await writeScorePatch(pg, contract.id, patch, run)
  if (!run.isCurrent()) return
  await run.mutate(() => publishSportsLiveScore(contract.id, patch))
  if (!run.isCurrent()) return

  const answers = (
    await pg.manyOrNone(`select * from answers where contract_id = $1`, [
      contract.id,
    ])
  ).map(convertAnswer)
  if (!run.isCurrent()) return
  const args = gameResolution(answers, side, d.sportsHomeTeam, d.sportsAwayTeam)
  if (!args) {
    throw new Error(
      `answers on ${contract.id} don't look like a game: ${answers
        .map((a) => a.text)
        .join(', ')}`
    )
  }
  const multi = { ...(contract as CPMMMultiContract), answers }
  if (!run.isCurrent()) return
  let resolutionMayBeRunning = false
  await run.mutate(
    () =>
      resolveMarketHelper(multi, creator, creator, args, (transactionState) => {
        resolutionMayBeRunning = transactionState === 'started'
      }),
    // Before the transaction callback no mutation has run. After COMMIT,
    // notification/revalidation errors cannot make the payout outcome unknown.
    () => !resolutionMayBeRunning
  )
}
