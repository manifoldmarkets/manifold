import { groupBy } from 'lodash'
import {
  BDL_LEAGUES,
  BDL_LEAGUE_KEYS,
  type BdlLeagueKey,
} from 'common/bdl/leagues'
import type { SportsCalendarEntry, SportId } from 'common/sports-calendar'

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
