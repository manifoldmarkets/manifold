import {
  BDL_LEAGUES,
  BDL_LEAGUE_KEYS,
  BdlLeagueKey,
  isBdlLeagueKey,
} from './leagues'
import {
  officialBdlLeagueKey,
  getSportsLeagueLabel,
  legacyOddsLeagueLabel,
} from '../sports-league-label'
import { ScheduleGame, sportForMarket } from '../sports-schedule'
import { WORLD_CUP_2026 } from '../sports'

const aliases = new Map<string, BdlLeagueKey>()
for (const key of BDL_LEAGUE_KEYS) {
  const league = BDL_LEAGUES[key]
  for (const name of [key, league.label, league.shortLabel])
    aliases.set(name.toLowerCase(), key)
}
aliases.set(WORLD_CUP_2026.sportsLeague.toLowerCase(), 'fifa/worldcup')
aliases.set('wc26', 'fifa/worldcup')

type GameLeague = Pick<
  ScheduleGame,
  'sportsLeagueKey' | 'league' | 'sportsEventId'
>

export function gameLeagueKey(game: GameLeague) {
  if (game.sportsLeagueKey)
    return isBdlLeagueKey(game.sportsLeagueKey)
      ? game.sportsLeagueKey
      : undefined
  const label = legacyOddsLeagueLabel(game.sportsEventId) ?? game.league
  return aliases.get(label.trim().toLowerCase())
}

type Engagement = Parameters<typeof officialBdlLeagueKey>[0] & {
  id: string
  groupIds?: readonly string[]
}
export function sportsEngagement(markets: readonly Engagement[]) {
  const sports = new Map<string, number>()
  const leagues = new Map<string, number>()
  const seen = new Set<string>()
  for (const market of markets) {
    if (seen.has(market.id) || market.sportsFixture) continue
    seen.add(market.id)
    const label = getSportsLeagueLabel(market)
    const key =
      officialBdlLeagueKey(market) ??
      (label && aliases.get(label.toLowerCase()))
    const sport = key
      ? BDL_LEAGUES[key].sportKey
      : sportForMarket({ sportsLeague: label, groupIds: market.groupIds })
    if (sport !== 'other') sports.set(sport, (sports.get(sport) ?? 0) + 1)
    if (key) leagues.set(key, (leagues.get(key) ?? 0) + 1)
  }
  return { sports, leagues }
}

// Array.sort is stable. Equal or absent counts preserve the site's preset order.
export function byEngagement<T>(
  items: readonly T[],
  key: (item: T) => string,
  counts: ReadonlyMap<string, number>
) {
  return [...items].sort(
    (a, b) => (counts.get(key(b)) ?? 0) - (counts.get(key(a)) ?? 0)
  )
}

export function leagueChoices(
  sport: string,
  counts: ReadonlyMap<string, number>
) {
  return byEngagement(
    BDL_LEAGUE_KEYS.filter(
      (key) => sport === 'all' || BDL_LEAGUES[key].sportKey === sport
    ),
    (key) => key,
    counts
  )
}
