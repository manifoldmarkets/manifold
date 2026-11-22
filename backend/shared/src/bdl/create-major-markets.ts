import {
  BDL_DEFAULT_STARTING_LIQUIDITY,
  BDL_GLOBAL_RUN_CAP,
  BDL_MIN_CREATION_LEAD_MS,
  BDL_REISSUED_EVENT_MATCH_WINDOW_MS,
} from 'common/bdl/constants'
import { isSportsBdlEnabled } from 'common/bdl/rollout'
import { BDL_LEAGUES } from 'common/bdl/leagues'
import {
  MAJOR_LEAGUES,
  MajorLeague,
  MajorCreationDecision,
  MajorCreationResult,
} from 'common/bdl/major-leagues'
import {
  reportMissingPolymarketTeams,
  selectOpeningLine,
} from 'common/bdl/opening-line'
import {
  autoCreates,
  calendarEntriesOverlapping,
  CompetitionSwitches,
  competitionSwitchError,
  SPORT_LEAGUE_LABEL,
  SportsCalendarEntry,
} from 'common/sports-calendar'
import { bdlEventId } from 'common/sports-ids'
import {
  chooseSportsGameAnte,
  SportsOpeningLine,
} from 'common/sports-kickoff-interface'
import { manifoldSportsUserId } from 'common/sports'
import { teamCode } from 'common/sports-team-codes'
import { gameAnswerColors } from 'common/sports-team-colors'
import { DAY_MS, HOUR_MS } from 'common/util/time'
import { groupBy, isEqual } from 'lodash'
import { bdlClock, BdlClock, createBdlClient } from '../balldontlie-client'
import { sportsCreator } from '../odds-markets'
import { resolveSportsGameAnte } from '../sports-game-ante'
import { findLockedSportsMarket } from '../sports-market-dedupe'
import {
  createSportsContract,
  flushSportsGroupEmbeddings,
  SportsContractParams,
  SportsMarketAlreadyExistsError,
  SportsGameStartedError,
} from '../sports-markets'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from '../supabase/init'
import { getCompetitionSwitches } from '../supabase/sports-competition-switches'
import { anythingToRichText } from '../tiptap'
import { isProd, log } from '../utils'
import {
  BdlCreationBudgetError,
  inspectBdlCreationBudget,
  requireBdlCreationBudget,
} from './creation-budget'
import { existingMajorGroups, majorCreationHold } from './major-creation-store'
import { fetchMajorGames, fetchMajorOdds, MajorGame } from './major-games'
import { getMajorSettings } from './major-settings'

export type MajorCreationOptions = {
  league?: MajorLeague
  competitionId?: string
  keys?: readonly string[]
  dryRun?: boolean
  force?: boolean
  role?: 'api' | 'scheduler' | 'dev' | 'codex'
}
type Dependencies = {
  pg?: SupabaseDirectClient
  clock?: BdlClock
  client?: ReturnType<typeof createBdlClient>
}

const easternDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const titleDate = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  month: 'short',
  day: 'numeric',
})

function eligiblePhases(
  league: MajorLeague,
  from: number,
  to: number,
  switches: CompetitionSwitches,
  options: MajorCreationOptions,
  game?: MajorGame
) {
  const applicable = calendarEntriesOverlapping(from, to).filter(
    (phase) =>
      phase.bdlLeagueKey === league &&
      phase.provider === 'bdl' &&
      (!game || matchesGameStage(phase, game))
  )
  const enabled = applicable.filter(
    (phase) =>
      (!options.competitionId ||
        phase.competitionId === options.competitionId) &&
      // The lifecycle runs only for enabled phases. A named retry can still
      // reserve a new contract after a mistaken cancellation in this phase.
      autoCreates(phase, switches) &&
      !competitionSwitchError(phase.competitionId, phase.phase, true, switches)
  )
  // A schedule window can span several phases. For a particular game, every
  // indistinguishable phase covering its kickoff must permit creation.
  return game && enabled.length !== applicable.length ? [] : enabled
}

function matchesGameStage(phase: SportsCalendarEntry, game: MajorGame) {
  if (/regular season/i.test(phase.phase)) return game.postseason === false
  if (/playoffs|world series/i.test(phase.phase))
    return game.postseason === true
  return true
}

function gameMarket(
  league: MajorLeague,
  game: MajorGame,
  start: number,
  phase: SportsCalendarEntry,
  line: SportsOpeningLine,
  groupIds: string[]
): SportsContractParams {
  const config = BDL_LEAGUES[league]
  const home = game.home.name,
    away = game.away.name
  const suffix = league === 'mlb' && game.gameNumber === 2 ? ' (Game 2)' : ''
  const question = `${away} at ${home}, ${titleDate.format(start)}${suffix}`
  const codes = [teamCode(league, away), teamCode(league, home)]
  const colors = gameAnswerColors(league, home, away, false)
  const tie =
    league === 'nfl'
      ? 'A final tie pays 50% to each team.'
      : 'A level final goes to a moderator for review.'
  const rules = `${away} at ${home}. Resolves to the official winner including overtime${
    league === 'nhl' ? ' and any shootout' : ''
  }. ${tie} A postponement follows the rescheduled game. A confirmed cancellation resolves N/A.`
  return {
    outcomeType: 'MULTIPLE_CHOICE',
    question,
    description: anythingToRichText({ raw: rules })!,
    liquidityTier: BDL_DEFAULT_STARTING_LIQUIDITY,
    answers: [away, home],
    answerProbs: line.probs.map((p) => p * 100),
    answerShortTexts: codes.every((c): c is string => !!c) ? codes : undefined,
    answerColors: colors ? [colors[1], colors[0]] : undefined,
    closeTime:
      start + (config.closeAtStart ? 0 : config.closeBufferHours! * HOUR_MS),
    sportsStartTimestamp: new Date(start).toISOString(),
    sportsEventId: bdlEventId(league, game.id),
    sportsMarketType: 'moneyline',
    sportsProvider: 'bdl',
    sportsLeagueKey: league,
    sportsCompetitionId: phase.competitionId,
    sportsLeague: SPORT_LEAGUE_LABEL[league],
    sportsHomeTeam: home,
    sportsAwayTeam: away,
    sportsHomeTeamId: String(game.home.id),
    sportsAwayTeamId: String(game.away.id),
    sportsStartKnown: true,
    openingLineSource: line.source,
    openingProbs: line.probs,
    openingBookCount: line.bookCount,
    openingLineVendors: line.vendors,
    openingSampledTime: line.sampledTime,
    groupIds,
  }
}

class CreationHold extends Error {}
function hold(reason: string): never {
  throw new CreationHold(reason)
}

export async function runMajorCreation(
  options: MajorCreationOptions = {},
  deps: Dependencies = {}
): Promise<MajorCreationResult> {
  if (options.force && (!options.league || !options.competitionId))
    throw Error('A forced run requires a selected league and competition')
  if (options.keys && options.keys.length > 200)
    throw Error('Select at most 200 games')
  const result: MajorCreationResult = {
    created: 0,
    wouldCreate: 0,
    skipped: 0,
    errors: 0,
    log: [],
  }
  if (!isSportsBdlEnabled()) return result
  const pg = deps.pg ?? createSupabaseDirectClient()
  const clock = deps.clock ?? bdlClock()
  const role = options.role ?? 'dev'
  const switches = await getCompetitionSwitches(pg)
  const selected = options.keys && new Set(options.keys)
  const batch = new Set<string>(),
    planned = new Map<MajorLeague, number>()
  let plannedTotal = 0,
    warnedLow = false
  const creatorId = manifoldSportsUserId(isProd())
  let creator: Awaited<ReturnType<typeof sportsCreator>> | undefined
  const push = (decision: MajorCreationDecision) => {
    result.log.push(decision)
    if (decision.status === 'dry-run') result.wouldCreate++
    else if (decision.status === 'error') result.errors++
    else result[decision.status]++
  }
  const reportLow = (low: boolean) => {
    if (low && !warnedLow) {
      warnedLow = true
      log.error('[sports-bdl-create] low funding balance')
    }
  }
  try {
    for (const league of options.league ? [options.league] : MAJOR_LEAGUES) {
      try {
        const config = BDL_LEAGUES[league],
          began = clock.now(),
          maxLead = config.maxLeadDays * DAY_MS
        if (
          !eligiblePhases(league, began, began + maxLead, switches, options)
            .length
        )
          continue
        const settings = await getMajorSettings(pg, league)
        const reportLeague = (reason: string) =>
          push({
            league,
            eventId: null,
            question: null,
            status: 'skipped',
            reason,
          })
        if (!settings && !options.dryRun) {
          reportLeague('budget-unconfigured')
          continue
        }
        if (
          settings &&
          easternDay.format(began + maxLead) < settings.startsOn
        ) {
          reportLeague('game before starts_on')
          continue
        }
        const client =
          deps.client ??
          createBdlClient({
            role,
            clock,
            key: process.env.BALLDONTLIE_API_KEY,
            enabledLeagues: new Set([league]),
            isLeagueEnabled: async (requested) =>
              requested === league &&
              eligiblePhases(
                league,
                began,
                began + maxLead,
                await getCompetitionSwitches(pg),
                options
              ).length > 0,
          })
        const games = await fetchMajorGames(
          client,
          league,
          easternDay.format(began - BDL_REISSUED_EVENT_MATCH_WINDOW_MS),
          easternDay.format(began + maxLead)
        )
        const seen = games.map((g) => bdlEventId(league, g.id))
        const slate = games.map((game) => ({
          game,
          eventId: bdlEventId(league, game.id),
          start: Date.parse(game.startTime ?? ''),
        }))
        const candidates = slate.filter(
          ({ game, start }) =>
            game.eligible &&
            game.status === 'scheduled' &&
            start > began + BDL_MIN_CREATION_LEAD_MS &&
            start <= began + maxLead
        )
        const odds = await fetchMajorOdds(
          client,
          league,
          candidates.map((x) => x.game)
        )
        // The diagnostic needs a whole date even on an admin-selected run.
        for (const day of Object.values(
          groupBy(candidates, (x) => x.game.slateDate)
        )) {
          reportMissingPolymarketTeams(
            league,
            day.map(({ eventId, start, game }) => ({
              eventId,
              startTimeMs: start,
              homeTeam: game.home.name,
              awayTeam: game.away.name,
            })),
            day.flatMap(({ game }) => odds.get(game.id) ?? []),
            clock.now(),
            (event, detail) => log.warn('[sports-bdl-odds] ' + event, detail)
          )
        }
        let perLeague = 0,
          groupIds: string[] | null | undefined
        for (const { game, start, eventId } of slate.sort(
          (a, b) => a.start - b.start || a.game.id - b.game.id
        )) {
          if (selected && !selected.has(eventId)) continue
          if (!selected && !(start > began)) continue
          const decision: MajorCreationDecision = {
            league,
            eventId,
            question: null,
            status: 'skipped',
            reason: null,
          }
          try {
            if (!game.eligible || game.status !== 'scheduled')
              hold('ineligible game or status')
            const now = clock.now()
            if (!Number.isFinite(start)) hold('unconfirmed kickoff')
            if (
              start <= now + BDL_MIN_CREATION_LEAD_MS ||
              start > now + maxLead
            )
              hold('outside creation window')
            const phases = eligiblePhases(
              league,
              start,
              start,
              switches,
              options,
              game
            )
            if (new Set(phases.map((p) => p.competitionId)).size !== 1)
              hold('no unique enabled phase')
            const phase = phases[0]
            if (settings && easternDay.format(start) < settings.startsOn)
              hold('game before starts_on')
            const target = {
              league,
              eventId,
              entrantIds: [String(game.away.id), String(game.home.id)] as const,
            }
            const rows = odds.get(game.id) ?? []
            const line = selectOpeningLine(rows, target, now)
            decision.line = line
            const params = gameMarket(league, game, start, phase, line, [])
            decision.question = params.question
            if (line.source === 'none') hold('no eligible moneyline')
            decision.ante = settings?.baseAnte ?? BDL_DEFAULT_STARTING_LIQUIDITY
            if (!settings) hold('budget-unconfigured')
            if (
              perLeague >= config.perRunCap ||
              plannedTotal >= BDL_GLOBAL_RUN_CAP
            )
              hold('run cap')
            groupIds ??= await existingMajorGroups(pg, settings.groupSlugs)
            if (!groupIds) hold('configured group unavailable')
            params.groupIds = groupIds
            const budget = {
              creatorId,
              leagueKey: league,
              waveLeagueKeys: settings.waveLeagueKeys,
              limits: settings.limits,
              expectedBaseAnte: settings.baseAnte,
              ante: settings.baseAnte,
            }
            const holdInput = {
              league,
              eventId,
              homeId: game.home.id,
              awayId: game.away.id,
              start,
              seenEventIds: seen,
            }
            const funding = {
              creatorId,
              competitionId: phase.competitionId,
              kickoffTime: start,
              startKnown: true,
              baseAnte: settings.baseAnte,
              line,
            }
            const allowCanceledEventId =
              options.force && selected?.has(eventId) ? eventId : undefined
            if (options.dryRun) {
              const prior = await pg.tx((tx) =>
                findLockedSportsMarket(
                  tx,
                  params,
                  'moneyline',
                  allowCanceledEventId
                )
              )
              if (prior) throw new SportsMarketAlreadyExistsError(prior.id)
              const reason = await majorCreationHold(pg, {
                ...holdInput,
                now: clock.now(),
              })
              if (reason) hold(reason)
              const ante = chooseSportsGameAnte({
                ...funding,
                mode: 'off',
              }).ante
              const simulated = [...planned.values()].reduce((a, b) => a + b, 0)
              const status = await inspectBdlCreationBudget(
                pg,
                { ...budget, ante },
                {
                  dailyAnte: planned.get(league) ?? 0,
                  waveAnte: settings.waveLeagueKeys.reduce(
                    (a, k) => a + (planned.get(k as MajorLeague) ?? 0),
                    0
                  ),
                  openAnte: simulated,
                  balanceDebits: simulated,
                }
              )
              reportLow(status.lowBalance)
              if (status.reason) hold(status.reason)
              planned.set(league, (planned.get(league) ?? 0) + ante)
              decision.status = 'dry-run'
              decision.ante = ante
            } else {
              creator ??= await sportsCreator()
              const contract = await createSportsContract(pg, creator, params, {
                groupEmbeddingBatch: batch,
                minLeadMs: BDL_MIN_CREATION_LEAD_MS,
                now: () => clock.now(),
                allowCanceledEventId,
                chooseAnte: async (tx) => {
                  const ante = await resolveSportsGameAnte(tx, funding)
                  const status = await requireBdlCreationBudget(tx, {
                    ...budget,
                    ante: ante.ante,
                  })
                  reportLow(status.lowBalance)
                  const [latest, current] = await Promise.all([
                    getCompetitionSwitches(tx),
                    getMajorSettings(tx, league),
                  ])
                  if (
                    !current ||
                    current.startsOn !== settings.startsOn ||
                    !isEqual(current.groupSlugs, settings.groupSlugs)
                  )
                    hold('settings-changed')
                  if (
                    !eligiblePhases(
                      league,
                      start,
                      start,
                      latest,
                      options,
                      game
                    ).some(
                      (p) =>
                        p.competitionId === phase.competitionId &&
                        p.phase === phase.phase
                    )
                  )
                    hold('phase disabled')
                  const reason = await majorCreationHold(tx, {
                    ...holdInput,
                    now: clock.now(),
                  })
                  if (reason) hold(reason)
                  const lockedNow = clock.now()
                  if (start <= lockedNow + BDL_MIN_CREATION_LEAD_MS)
                    hold('kicks off too soon')
                  const fresh = selectOpeningLine(rows, target, lockedNow)
                  if (
                    !isEqual({ ...fresh, sampledTime: line.sampledTime }, line)
                  )
                    hold('opening line changed or expired')
                  decision.ante = ante.ante
                  return ante
                },
              })
              decision.status = 'created'
              decision.contractId = contract.id
            }
            perLeague++
            plannedTotal++
          } catch (e) {
            if (e instanceof SportsMarketAlreadyExistsError) {
              decision.reason = 'market already exists'
              decision.contractId = e.contractId
            } else if (e instanceof SportsGameStartedError) {
              decision.reason = 'kicks off too soon'
            } else if (e instanceof BdlCreationBudgetError) {
              reportLow(e.status.lowBalance)
              decision.reason = e.status.reason
            } else if (e instanceof CreationHold) {
              decision.reason = e.message
              if (e.message.startsWith('possible-reid:'))
                log.error('[sports-bdl-create] possible-reid', {
                  league,
                  eventId,
                  reason: e.message,
                })
            } else {
              decision.status = 'error'
              decision.reason = 'creation failed'
              log.error('[sports-bdl-create] game failed', {
                league,
                eventId,
                error: String(e),
              })
            }
          }
          push(decision)
        }
      } catch (e) {
        log.error('[sports-bdl-create] league failed', {
          league,
          error: String(e),
        })
        push({
          league,
          eventId: null,
          question: null,
          status: 'error',
          reason: 'league unavailable',
        })
      }
    }
  } finally {
    if (batch.size) await flushSportsGroupEmbeddings(pg, batch)
  }
  return result
}
