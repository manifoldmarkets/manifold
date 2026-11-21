import { isSportsBdlEnabled } from 'common/bdl/rollout'
import {
  BDL_MAX_DATE_ONLY_SPAN_MS,
  storedGameDayEnd,
} from 'common/bdl/game-day'
import { parseSportsKickoffMs } from 'common/sports-kickoff-interface'
import { HOUR_MS } from 'common/util/time'
import { BDL_OPEN_ODDS_MATCH_WINDOW_MS } from 'common/bdl/constants'
import { BDL_LEAGUES, BdlLeagueKey } from 'common/bdl/leagues'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import { SPORT_LEAGUE_LABEL, SportId } from 'common/sports-calendar'
import { providerOf, SportsProvider } from 'common/sports-provider'
import { sportForLeague } from 'common/sports-score-polling'
import { normalizeTeam } from 'common/sports-team-colors'

import type { SupabaseDirectClient, SupabaseTransaction } from './supabase/init'
import { sportsProviderSql } from './supabase/sports-provider'

/** Legacy pipelines may regenerate a cancelled market. BDL reserves it by event and type. */
export const findSportsMarket = (
  pg: Pick<SupabaseDirectClient, 'oneOrNone'>,
  eventId: string,
  marketType: string,
  includeCanceled = false
) =>
  pg.oneOrNone<{ id: string }>(
    `select id from contracts
     where data->>'sportsEventId' = $1
       and creator_id = any($2)
       and token = 'MANA'
       ${includeCanceled ? '' : "and resolution is distinct from 'CANCEL'"}
       and data->>'sportsMarketType' = $3
     limit 1`,
    [eventId, MANIFOLD_SPORTS_USER_IDS, marketType]
  )

type Market = {
  sportsEventId: string
  sportsProvider?: SportsProvider
  sportsLeagueKey?: BdlLeagueKey
  sportsLeague: string
  sportsHomeTeam?: string
  sportsAwayTeam?: string
  sportsStartTimestamp: string
  sportsStartKnown?: boolean
  sportsLatestPossibleStartTimestamp?: string
}

const easternDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function teamPair(
  home: string | null | undefined,
  away: string | null | undefined
) {
  if (!home || !away) return
  const a = normalizeTeam(home),
    b = normalizeTeam(away)
  if (!a || !b || a === b) return
  return [a, b].sort().join(':')
}

type OpenMoneyline = {
  id: string
  home: string | null
  away: string | null
  start: string | null
  date_only: boolean | null
  latest_start: string | null
}

/** Call inside the same transaction as the insert and the ante. The Odds pipeline
 * participates in the matchup lock but may still create its distinct event IDs.
 * During a BDL phase, each provider also checks for open games from the other. */
export async function findLockedSportsMarket(
  tx: Pick<SupabaseTransaction, 'one' | 'oneOrNone' | 'manyOrNone'>,
  candidate: Market,
  marketType: string,
  allowCanceledEventId?: string,
  checkOpenBdl = false
) {
  const bdl = candidate.sportsProvider === 'bdl'
  const lock = (key: string) =>
    tx.one('select pg_advisory_xact_lock(hashtext($1))', [key])
  await lock(`sports-${marketType}:${candidate.sportsEventId}`)
  const exact = await findSportsMarket(
    tx,
    candidate.sportsEventId,
    marketType,
    bdl &&
      !(
        marketType === 'moneyline' &&
        allowCanceledEventId === candidate.sportsEventId
      )
  )
  if (exact || marketType !== 'moneyline') return exact
  if (!bdl && (!isSportsBdlEnabled() || providerOf(candidate) !== 'odds'))
    return null

  const sport: SportId | null | undefined = bdl
    ? candidate.sportsLeagueKey &&
      BDL_LEAGUES[candidate.sportsLeagueKey]?.sportId
    : sportForLeague(candidate.sportsLeague)
  const teams = teamPair(candidate.sportsHomeTeam, candidate.sportsAwayTeam)
  const start = Date.parse(candidate.sportsStartTimestamp)
  const end =
    candidate.sportsStartKnown !== false
      ? start
      : candidate.sportsLatestPossibleStartTimestamp === undefined
      ? start + BDL_MAX_DATE_ONLY_SPAN_MS
      : parseSportsKickoffMs(candidate.sportsLatestPossibleStartTimestamp)
  if (
    !sport ||
    !teams ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end < start ||
    end - start > BDL_MAX_DATE_ONLY_SPAN_MS
  ) {
    if (bdl || checkOpenBdl)
      throw new Error(
        'BDL cutover moneyline needs a known sport, two identifiable teams and a kickoff for deduplication'
      )
    return null
  }
  // The six-hour window can cross Eastern midnight. Lock all touched dates in
  // the same order so overlapping runs coordinate at midnight and across DST.
  const last = end + BDL_OPEN_ODDS_MATCH_WINDOW_MS
  const lockDays = new Set([easternDate.format(last)])
  // Sampling every half day visits every Eastern calendar date, including on
  // a DST change, across a date-only game's entire possible matchup window.
  for (
    let t = start - BDL_OPEN_ODDS_MATCH_WINDOW_MS;
    t < last;
    t += 12 * HOUR_MS
  )
    lockDays.add(easternDate.format(t))
  for (const day of [...lockDays].sort())
    await lock(`sports-moneyline:${sport}:${day}:${teams}`)
  if (!bdl && !checkOpenBdl) return null

  // Read the kickoff recorded on the contract. Its close time can differ, e.g.
  // after a manual change. Normalize both sides in TS using the same team rules.
  const open = await tx.manyOrNone<OpenMoneyline>(
    `select c.id, c.data->>'sportsHomeTeam' as home, c.data->>'sportsAwayTeam' as away,
            c.data->>'sportsStartTimestamp' as start,
            (c.data->>'sportsStartKnown') = 'false' as date_only,
            c.data->>'sportsLatestPossibleStartTimestamp' as latest_start
       from contracts c
      where c.creator_id = any($1) and c.token = 'MANA'
        and c.resolution is null and c.deleted is not true
        and (c.close_time is null or c.close_time > now())
        and c.data->>'sportsLeague' = $2 and c.data->>'sportsMarketType' = 'moneyline'
        and c.data->>'sportsFixture' is distinct from 'true'
        and ${sportsProviderSql()} = $3
      order by c.id`,
    [MANIFOLD_SPORTS_USER_IDS, SPORT_LEAGUE_LABEL[sport], bdl ? 'odds' : 'bdl']
  )
  return (
    open.find((row) => {
      const otherStart = Date.parse(row.start ?? '')
      const otherEnd = storedGameDayEnd(
        otherStart,
        row.date_only,
        row.latest_start
      )
      return (
        start <= otherEnd + BDL_OPEN_ODDS_MATCH_WINDOW_MS &&
        otherStart <= end + BDL_OPEN_ODDS_MATCH_WINDOW_MS &&
        teamPair(row.home, row.away) === teams
      )
    }) ?? null
  )
}
