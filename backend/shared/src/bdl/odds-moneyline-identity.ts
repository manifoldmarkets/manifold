import { groupBy } from 'lodash'
import { BDL_LEAGUES, BDL_LEAGUE_KEYS, BdlLeagueKey } from 'common/bdl/leagues'
import { MULTI_CPMM_MECHANISMS_SQL } from 'common/contract'
import {
  SPORTS_CALENDAR,
  SportsCalendarEntry,
  SportId,
} from 'common/sports-calendar'
import { sportsProviderSql } from '../supabase/sports-provider'

// Several Odds competitions share a generic sport label such as Soccer.
const leagueByOddsKey: Partial<Record<string, BdlLeagueKey>> = {
  soccer_epl: 'epl',
  soccer_usa_mls: 'mls',
  soccer_spain_la_liga: 'laliga',
  soccer_italy_serie_a: 'seriea',
  soccer_germany_bundesliga: 'bundesliga',
  soccer_france_ligue_one: 'ligue1',
  soccer_uefa_champs_league: 'ucl',
  soccer_uefa_champs_league_qualification: 'ucl',
  soccer_fifa_world_cup: 'fifa/worldcup',
  basketball_euroleague: 'euroleague',
}

const leaguesBySport = groupBy(
  BDL_LEAGUE_KEYS,
  (key) => BDL_LEAGUES[key].sportId
)
export function uniqueLeagueForSport(sport: SportId) {
  const matches = leaguesBySport[sport]
  return matches?.length === 1 ? matches[0] : undefined
}

export function calendarLeague(entry: SportsCalendarEntry) {
  const unique = uniqueLeagueForSport(entry.sport)
  if (unique) return unique
  if (!entry.oddsKey) return undefined
  if (entry.oddsKey.startsWith('tennis_atp_')) return 'atp'
  if (entry.oddsKey.startsWith('tennis_wta_')) return 'wta'
  return leagueByOddsKey[entry.oddsKey]
}

export function oddsKeysForLeague(league: BdlLeagueKey) {
  return [
    ...new Set(
      SPORTS_CALENDAR.flatMap((entry) =>
        !entry.provider && entry.oddsKey && calendarLeague(entry) === league
          ? [entry.oddsKey]
          : []
      )
    ),
  ]
}

// All expressions refer to contracts aliased as c. A typed event ID identifies
// the Odds sport even on rows written before league and market-type metadata.
export const oddsEventKeySql =
  "substring(c.data->>'sportsEventId' from '^odds:([^:]+):.+$')"
export const oddsLegacyLabelSql = `case when c.data->>'sportsEventId' <> ''
  and c.data->>'sportsEventId' !~ '^(odds:|bdl[-:]|fd-|fixture:)'
  then c.data->>'sportsLeague' end`

export function oddsMoneylineSql() {
  return `(${sportsProviderSql()} = 'odds'
    and c.data->>'sportsFixture' is distinct from 'true'
    and not starts_with(c.data->>'sportsEventId', 'fixture:')
    and (c.data->>'sportsMarketType' = 'moneyline' or (
      c.data->>'sportsMarketType' is null and c.mechanism in ${MULTI_CPMM_MECHANISMS_SQL}
      and c.data->>'sportsEventId' ~ '^odds:[^:]+:.+$'
    )))`
}
