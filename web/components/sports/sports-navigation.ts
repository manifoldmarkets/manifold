import { BDL_LEAGUES, BdlLeagueKey, isBdlLeagueKey } from 'common/bdl/leagues'
import { sportsFamily } from 'common/sports-navigation-family'
import { ScheduleGame, sportPath, SportSelection } from 'common/sports-schedule'

export const SPORTS_VIEWS = [
  ['schedule', 'Schedule'],
  ['live', 'Live'],
  ['results', 'Results'],
  ['markets', 'All markets'],
  ['picks', 'My picks'],
] as const

type QueryValue = string | string[] | undefined

export function sportsView(tab: QueryValue, legacySport?: QueryValue) {
  if (tab === 'topic' || tab === 'leaderboards') return tab
  if (!tab && legacySport === 'live') return 'live'
  return SPORTS_VIEWS.find(([key]) => key === tab)?.[0] ?? 'schedule'
}

/** Unknown/ambiguous league URLs must not silently show every league. */
export function sportsLeague(value: QueryValue) {
  if (value === undefined || value === 'all') return undefined
  return typeof value === 'string' && isBdlLeagueKey(value) ? value : null
}

export function sportsViewHref(
  sport: SportSelection,
  view: ReturnType<typeof sportsView>,
  league?: QueryValue
) {
  const query = new URLSearchParams()
  if (view !== 'schedule') query.set('tab', view)
  if (Array.isArray(league)) {
    for (const value of league) query.append('league', value)
  } else if (league !== undefined && league !== 'all') {
    query.set('league', league)
  }
  const search = query.toString()
  return sportPath(sport) + (search ? '?' + search : '')
}

export function leagueRailChoices(
  sport: SportSelection,
  leagues: readonly BdlLeagueKey[],
  active: BdlLeagueKey | null | undefined
) {
  const choices = leagues.filter(isBdlLeagueKey)
  if (
    active &&
    !choices.includes(active) &&
    (sport === 'all' ||
      sportsFamily(BDL_LEAGUES[active].sportKey, active) ===
        sportsFamily(sport))
  )
    choices.push(active)
  return choices
}

export function matchesGameLeague(
  game: Pick<ScheduleGame, 'sportsLeagueKey' | 'navigationLeagueKey'>,
  league: BdlLeagueKey | null | undefined
) {
  return (
    league === undefined ||
    (league !== null &&
      (game.navigationLeagueKey ?? game.sportsLeagueKey) === league)
  )
}

export function hasSportsResult(
  game: Pick<ScheduleGame, 'isCanceled' | 'isResolved' | 'reportedFinal'>
) {
  return !game.isCanceled && (game.isResolved || game.reportedFinal === true)
}
