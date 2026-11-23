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
import { bdlLiveInterval } from 'common/sports-score-polling'
import { createBdlClient } from '../balldontlie-client'
import { publishSportsLiveScore } from '../publish-sports-live-score'
import type { SupabaseDirectClient } from '../supabase/init'
import { getCompetitionSwitches } from '../supabase/sports-competition-switches'
import { getScorePollingSettings } from '../supabase/sports-score-polling'
import { updateSportsScore } from '../update-sports-score'
import { isProd, log } from '../utils'
import { fetchMajorGames, MajorGame } from './major-games'

const nbaMoneyline = {
  sportsProvider: 'bdl',
  sportsLeagueKey: 'nba',
  sportsMarketType: 'moneyline',
  sportsStartKnown: true,
} as const
const easternDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
})
type Market = {
  id: string
  event: string
  competition: string
  start: string
  home: string
  away: string
}

async function nbaPolling(pg: SupabaseDirectClient) {
  const [switches, settings] = await Promise.all([
    getCompetitionSwitches(pg),
    getScorePollingSettings(pg),
  ])
  return (market: Market) => {
    const start = parseSportsKickoffMs(market.start)
    const phase = calendarEntriesOverlapping(start, start).find(
      (p) => p.bdlLeagueKey === 'nba' && p.competitionId === market.competition
    )
    return phase &&
      autoCreates(phase, switches) &&
      !competitionSwitchError(phase.competitionId, phase.phase, true, switches)
      ? bdlLiveInterval('nba', market.id, settings)
      : 0
  }
}

export function nbaScorePatch(
  market: Pick<Market, 'home' | 'away'>,
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
    (game.status === 'final' && game.homeScore === game.awayScore)
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

/** One NBA slate read supplies every due market on that Eastern game day. */
export async function pollNbaScores(
  pg: SupabaseDirectClient,
  lastAttempts: Map<string, number>
) {
  if (
    !isSportsBdlEnabled() ||
    !(process.env.BALLDONTLIE_API_KEY || process.env.BDL_FIXTURE_DIR)
  )
    return
  const now = Date.now()
  const markets = await pg.manyOrNone<Market>(
    `select id, data->>'sportsEventId' as event,
            data->>'sportsCompetitionId' as competition, data->>'sportsStartTimestamp' as start,
            data->>'sportsHomeTeamId' as home, data->>'sportsAwayTeamId' as away
       from contracts
      where creator_id = any($1) and data @> $2::jsonb and token = 'MANA'
        and visibility = 'public' and deleted is not true and resolution is null
        and data->>'isResolved' is distinct from 'true'
        and data->>'sportsLiveStatus' is distinct from 'FINISHED'
        and coalesce(data->'sportsFixture', 'false'::jsonb) = 'false'::jsonb
        and mechanism in ${MULTI_CPMM_MECHANISMS_SQL}
        and close_time between $3::timestamptz - interval '3 days' and $3::timestamptz + interval '8 hours'`,
    [MANIFOLD_SPORTS_USER_IDS, JSON.stringify(nbaMoneyline), new Date(now)]
  )
  const currentIds = new Set(markets.map((m) => m.id))
  for (const id of lastAttempts.keys())
    if (!currentIds.has(id)) lastAttempts.delete(id)
  if (!markets.length) return
  const interval = await nbaPolling(pg)
  const due = markets.flatMap((market) => {
    const parsed = parseBdlEventId(market.event)
    const start = parseSportsKickoffMs(market.start)
    if (
      parsed?.league !== 'nba' ||
      parsed.suffix ||
      !(start <= now) ||
      !/^[1-9]\d*$/.test(market.home) ||
      !/^[1-9]\d*$/.test(market.away) ||
      market.home === market.away
    )
      return []
    const seconds = interval(market)
    if (
      !seconds ||
      now - (lastAttempts.get(market.id) ?? -Infinity) < seconds * 1000
    )
      return []
    return [{ ...market, gameId: parsed.id, slate: easternDay.format(start) }]
  })
  for (const [day, slate] of Object.entries(groupBy(due, (m) => m.slate))) {
    const enabled = async () => {
      if (!isSportsBdlEnabled()) return false
      const polling = await nbaPolling(pg)
      return slate.some((m) => polling(m) > 0)
    }
    const client = createBdlClient({
      role: isProd() ? 'scheduler' : 'dev',
      key: process.env.BALLDONTLIE_API_KEY,
      enabledLeagues: new Set(['nba']),
      isLeagueEnabled: enabled,
    })
    for (const market of slate) lastAttempts.set(market.id, now)
    const ids = new Set(slate.map((m) => m.gameId))
    const readStartedAt = Date.now()
    const games = await fetchMajorGames(client, 'nba', day, day, ids)
    const receivedAt = Date.now()
    const byId = new Map(games.map((game) => [game.id, game]))
    const stillEnabled = await nbaPolling(pg)
    for (const market of slate) {
      const game = byId.get(market.gameId)
      if (!isSportsBdlEnabled() || !stillEnabled(market)) continue
      const patch = nbaScorePatch(market, game, receivedAt)
      if (!patch) continue
      const identity = {
        ...nbaMoneyline,
        sportsEventId: market.event,
        sportsCompetitionId: market.competition,
        sportsStartTimestamp: market.start,
        sportsHomeTeamId: market.home,
        sportsAwayTeamId: market.away,
      }
      try {
        if (
          await updateSportsScore(pg, market.id, patch, {
            identity,
            readStartedAt,
          })
        )
          await publishSportsLiveScore(market.id, patch)
      } catch (error) {
        log.error(
          `[sports-bdl-nba] score update failed for ${market.id}: ${error}`
        )
      }
    }
  }
}
