import { MAJOR_LEAGUES, MajorLeague } from 'common/bdl/major-leagues'
import { groupBy } from 'lodash'
import { isSportsBdlEnabled } from 'common/bdl/rollout'
import { MULTI_CPMM_MECHANISMS_SQL } from 'common/contract'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import {
  autoCreates,
  calendarEntriesOverlapping,
  competitionSwitchError,
} from 'common/sports-calendar'
import { parseBdlEventId } from 'common/sports-ids'
import { parseSportsKickoffMs } from 'common/sports-kickoff-interface'
import {
  bdlLiveInterval,
  finalsPollInterval,
  pollingTarget,
} from 'common/sports-score-polling'
import { createBdlClient } from '../balldontlie-client'
import { publishSportsLiveScore } from '../publish-sports-live-score'
import type { SupabaseDirectClient } from '../supabase/init'
import { getCompetitionSwitches } from '../supabase/sports-competition-switches'
import { getScorePollingSettings } from '../supabase/sports-score-polling'
import { updateSportsScore } from '../update-sports-score'
import { isProd, log } from '../utils'
import { fetchMajorGames, MajorGame, matchesMajorStage } from './major-games'

const majorMoneyline = {
  sportsProvider: 'bdl',
  sportsMarketType: 'moneyline',
  sportsStartKnown: true,
} as const
const easternDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
})
type Market = {
  id: string
  event: string
  league: MajorLeague
  competition: string
  fundedPhase: string | null
  start: string
  closeMs: number
  home: string
  away: string
}

async function majorPolling(pg: SupabaseDirectClient, markets: Market[]) {
  const [switches, settings] = await Promise.all([
    getCompetitionSwitches(pg),
    getScorePollingSettings(pg, [
      pollingTarget.finals,
      ...new Set(markets.map((m) => pollingTarget.league(m.league))),
      ...markets.map((m) => pollingTarget.game(m.id)),
    ]),
  ])
  return (market: Market) => {
    const start = parseSportsKickoffMs(market.start)
    const phases = calendarEntriesOverlapping(start, start).filter(
      (p) =>
        p.bdlLeagueKey === market.league &&
        p.competitionId === market.competition &&
        (market.fundedPhase === null || p.phase === market.fundedPhase)
    )
    const phase = phases.length === 1 ? phases[0] : undefined
    if (
      !phase ||
      !autoCreates(phase, switches) ||
      competitionSwitchError(phase.competitionId, phase.phase, true, switches)
    )
      return { live: 0, finals: 0, phase: undefined }
    const now = Date.now()
    const closeTime = market.closeMs
    const live =
      now < closeTime ? bdlLiveInterval(market.league, market.id, settings) : 0
    const finals = finalsPollInterval(
      { sport: market.league, startTime: start, closeTime },
      now,
      settings.finals
    )
    return { live, finals, phase: phase.phase }
  }
}

export function majorScorePatch(
  market: Pick<Market, 'home' | 'away' | 'league'>,
  game: MajorGame | undefined,
  receivedAt: number
) {
  if (
    !game?.eligible ||
    !game.startTime ||
    Date.parse(game.startTime) > receivedAt ||
    (game.status !== 'in_progress' && game.status !== 'final') ||
    game.homeScore === null ||
    game.awayScore === null ||
    (game.status === 'final' &&
      game.homeScore === game.awayScore &&
      !(
        market.league === 'nfl' &&
        game.postseason === false &&
        game.season >= 2027
      ))
  )
    return null
  const same =
    market.home === String(game.home.id) && market.away === String(game.away.id)
  const swapped =
    market.home === String(game.away.id) && market.away === String(game.home.id)
  if (!same && !swapped) return null
  return {
    sportsHomeScore: same ? game.homeScore : game.awayScore,
    sportsAwayScore: same ? game.awayScore : game.homeScore,
    sportsLiveStatus: game.status === 'final' ? 'FINISHED' : 'IN_PLAY',
    sportsLiveMinute: null,
    sportsLiveUpdatedTime: receivedAt,
    sportsScoreUpdatedTime: null,
  }
}

export type MajorPollAttempts = Map<string, { live?: number; finals?: number }>

/** One slate read per league supplies every due market on that Eastern game day. */
export async function pollMajorScores(
  pg: SupabaseDirectClient,
  lastAttempts: MajorPollAttempts,
  signal?: AbortSignal,
  leagues: readonly MajorLeague[] = MAJOR_LEAGUES
) {
  const active = () => !signal?.aborted && isSportsBdlEnabled()
  if (
    !active() ||
    !(process.env.BALLDONTLIE_API_KEY || process.env.BDL_FIXTURE_DIR)
  )
    return
  const now = Date.now()
  const markets = await pg.manyOrNone<Market>(
    `select id, data->>'sportsEventId' as event, data->>'sportsLeagueKey' as league,
            data->>'sportsCompetitionId' as competition, data->>'sportsStartTimestamp' as start,
            data->>'sportsCompetitionPhase' as "fundedPhase",
            data->>'sportsHomeTeamId' as home, data->>'sportsAwayTeamId' as away,
            (extract(epoch from close_time)*1000)::double precision as "closeMs"
       from contracts
      where creator_id = any($1) and data @> $2::jsonb and token = 'MANA'
        and visibility = 'public' and deleted is not true and resolution is null
        and data->>'isResolved' is distinct from 'true'
        and data->>'sportsLiveStatus' is distinct from 'FINISHED'
        and coalesce(data->'sportsFixture', 'false'::jsonb) = 'false'::jsonb
        and mechanism in ${MULTI_CPMM_MECHANISMS_SQL}
        and data->>'sportsLeagueKey' = any($4::text[])
        and close_time between $3::timestamptz - interval '3 days' and $3::timestamptz + interval '8 hours'`,
    [
      MANIFOLD_SPORTS_USER_IDS,
      JSON.stringify(majorMoneyline),
      new Date(now),
      leagues,
    ]
  )
  if (!active()) return
  const currentIds = new Set(markets.map((m) => m.id))
  for (const id of lastAttempts.keys())
    if (!currentIds.has(id)) lastAttempts.delete(id)
  if (!markets.length) return
  const interval = await majorPolling(pg, markets)
  if (!active()) return
  // A pending permission read inside the shared limiter must also release its
  // place when this run expires, even if its database connection stays stuck.
  const abandoned = new Promise<null>((resolve) => {
    signal?.addEventListener('abort', () => resolve(null), { once: true })
  })
  const eligible = markets.flatMap((market) => {
    const parsed = parseBdlEventId(market.event)
    const start = parseSportsKickoffMs(market.start)
    if (
      parsed?.league !== market.league ||
      parsed.suffix ||
      !(start <= now) ||
      !/^[1-9]\d*$/.test(market.home) ||
      !/^[1-9]\d*$/.test(market.away) ||
      market.home === market.away
    )
      return []
    const { live, finals, phase } = interval(market)
    const last = lastAttempts.get(market.id)
    const liveDue = live > 0 && now - (last?.live ?? -Infinity) >= live * 1000
    const finalsDue =
      finals > 0 && now - (last?.finals ?? -Infinity) >= finals * 1000
    if (!phase || (!live && !finals)) return []
    const due = liveDue || finalsDue
    return [
      {
        ...market,
        gameId: parsed.id,
        slate: easternDay.format(start),
        phase,
        liveDue,
        finalsDue,
        // A requesting market must keep its original due lane. A sibling may
        // reuse a final only under a lane enabled before the request began.
        allowLive: due ? liveDue : live > 0,
        allowFinals: due ? finalsDue : finals > 0,
      },
    ]
  })
  const enabled = async (candidates: typeof eligible, liveOnly = false) => {
    if (!active()) return false
    const polling = await Promise.race([
      majorPolling(pg, candidates),
      abandoned,
    ])
    return (
      active() &&
      !!polling &&
      candidates.some((m) => {
        const { live, finals } = polling(m)
        return (
          (m.allowLive && live > 0) ||
          (!liveOnly && m.allowFinals && finals > 0)
        )
      })
    )
  }
  const broadcasts: {
    market: (typeof eligible)[number]
    patch: NonNullable<ReturnType<typeof majorScorePatch>>
  }[] = []
  for (const slate of Object.values(
    groupBy(eligible, (m) => m.league + ':' + m.slate)
  )) {
    const { league, slate: day } = slate[0]
    if (!active()) return
    const due = slate.filter((m) => m.liveDue || m.finalsDue)
    if (!due.length) continue
    const client = createBdlClient({
      role: isProd() ? 'scheduler' : 'dev',
      key: process.env.BALLDONTLIE_API_KEY,
      enabledLeagues: new Set([league]),
      isLeagueEnabled: () => enabled(due),
    })
    for (const market of due) {
      const last = lastAttempts.get(market.id) ?? {}
      if (market.liveDue) last.live = now
      if (market.finalsDue) last.finals = now
      lastAttempts.set(market.id, last)
    }
    const ids = new Set(due.map((m) => m.gameId))
    const readStartedAt = Date.now()
    let games: MajorGame[]
    try {
      games = await fetchMajorGames(client, league, day, day, ids)
    } catch (error) {
      log.error(`[sports-bdl-${league}] score read failed for ${day}: ${error}`)
      continue
    }
    const receivedAt = Date.now()
    const byId = new Map(games.map((game) => [game.id, game]))
    for (const market of slate) {
      if (!active()) return
      const game = byId.get(market.gameId)
      if (!game || !matchesMajorStage(league, market.phase, game)) continue
      const patch = majorScorePatch(market, game, receivedAt)
      if (!patch) continue
      const final = patch.sportsLiveStatus === 'FINISHED'
      if (!final && !market.liveDue) continue
      if (
        final &&
        Date.parse(game.startTime!) !== parseSportsKickoffMs(market.start)
      )
        continue
      const same = market.home === String(game.home.id)
      const teams = {
        sportsHomeTeam: same ? game.home.name : game.away.name,
        sportsAwayTeam: same ? game.away.name : game.home.name,
      }
      const identity = {
        ...majorMoneyline,
        sportsLeagueKey: league,
        sportsEventId: market.event,
        sportsCompetitionId: market.competition,
        ...(market.fundedPhase === null
          ? {}
          : { sportsCompetitionPhase: market.fundedPhase }),
        sportsStartTimestamp: market.start,
        sportsHomeTeamId: market.home,
        sportsAwayTeamId: market.away,
      }
      try {
        // An in-flight live-only read cannot acquire a new finals permission
        // after an operator disables live updates. The next due final can retry.
        const permitted = () => enabled([market], !final)
        if (!(await permitted()) || !active()) continue
        // A historical FINISHED badge alone is insufficient evidence for payout.
        const stored = final
          ? {
              ...patch,
              sportsFinalObservation: { ...identity, ...teams, ...patch },
            }
          : patch
        const written = await updateSportsScore(pg, market.id, stored, {
          identity: final ? { ...identity, ...teams } : identity,
          readStartedAt,
          closeOnFinal: final
            ? { phase: market.phase, closeTime: market.closeMs }
            : undefined,
        })
        if (written) broadcasts.push({ market, patch })
      } catch (error) {
        log.error(
          `[sports-bdl-${league}] score update failed for ${market.id}: ${error}`
        )
      }
    }
  }
  // Commit every verified cutoff before waiting on external score delivery.
  for (const { market, patch } of broadcasts) {
    if (!active()) return
    try {
      if (
        (await enabled([market], patch.sportsLiveStatus !== 'FINISHED')) &&
        active()
      )
        await publishSportsLiveScore(market.id, patch)
    } catch (error) {
      log.error(
        `[sports-bdl-${market.league}] score broadcast failed for ${market.id}: ${error}`
      )
    }
  }
}

/** The NBA pilot can still be replayed independently of other enabled leagues. */
export const pollNbaScores = (
  pg: SupabaseDirectClient,
  attempts: MajorPollAttempts,
  signal?: AbortSignal
) => pollMajorScores(pg, attempts, signal, ['nba'])
