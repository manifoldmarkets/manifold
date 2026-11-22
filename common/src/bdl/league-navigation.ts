import {
  BDL_LEAGUES,
  BDL_LEAGUE_KEYS,
  BdlLeagueKey,
  isBdlLeagueKey,
} from './leagues'
import { legacyOddsLeagueLabel } from '../sports-league-label'
import { parseBdlEventId } from '../sports-ids'
import { parseF1EventId, parseF1TitleEventId } from '../f1-markets'
import { providerOf, SportsProvider } from '../sports-provider'
import { ScheduleGame, sportForMarket } from '../sports-schedule'
import { MANIFOLD_SPORTS_USER_IDS, WORLD_CUP_2026 } from '../sports'

const aliases = new Map<string, BdlLeagueKey>()
for (const key of BDL_LEAGUE_KEYS) {
  const league = BDL_LEAGUES[key]
  for (const name of [key, league.label, league.shortLabel])
    aliases.set(name.toLowerCase(), key)
}
for (const [name, key] of [
  [WORLD_CUP_2026.sportsLeague, 'fifa/worldcup'],
  ['WC26', 'fifa/worldcup'],
  ['FIFA WC', 'fifa/worldcup'],
  ['WNCAAB', 'ncaaw'],
  ['NBA Preseason', 'nba'],
  ['NBA PRE', 'nba'],
  ['NFL Preseason', 'nfl'],
  ['NHL Preseason', 'nhl'],
  ['NHL PRE', 'nhl'],
  ['NBA Summer League', 'nba'],
  ['NBA SUMMER', 'nba'],
  ['MLB Preseason', 'mlb'],
  ['MLB PRE', 'mlb'],
] as const)
  aliases.set(name.toLowerCase(), key)

type MarketIdentity = {
  sportsEventId?: string | null
  sportsProvider?: SportsProvider | null
  sportsLeagueKey?: string | null
  sportsLeague?: string | null
  sportsFixture?: boolean
}

/** Only an unprefixed legacy event can fall back to its historical league label. */
export function marketLeagueKey(
  market: MarketIdentity
): BdlLeagueKey | undefined {
  const id = market.sportsEventId
  if (!id || market.sportsFixture) return
  const inferred = providerOf({ sportsEventId: id })
  const provider = providerOf(market)
  if (
    provider === 'fixture' ||
    (inferred !== 'legacy' && inferred !== provider)
  )
    return
  const label = aliases.get(market.sportsLeague?.trim().toLowerCase() ?? '')
  const key =
    provider === 'bdl'
      ? parseBdlEventId(id)?.league ??
        (parseF1EventId(id) || parseF1TitleEventId(id) ? 'f1' : undefined)
      : provider === 'odds'
      ? aliases.get(legacyOddsLeagueLabel(id)?.toLowerCase() ?? '')
      : provider === 'football-data'
      ? /^fd-[1-9]\d*$/.test(id) && label === 'fifa/worldcup'
        ? label
        : undefined
      : provider === 'legacy'
      ? label
      : undefined
  if (
    (market.sportsLeagueKey != null && market.sportsLeagueKey !== key) ||
    (label && label !== key)
  )
    return
  return key
}

type GameLeague = Pick<
  ScheduleGame,
  'navigationLeagueKey' | 'sportsLeagueKey' | 'league' | 'sportsEventId'
>
export function gameLeagueKey(game: GameLeague) {
  const key = marketLeagueKey({ ...game, sportsLeague: game.league })
  return game.navigationLeagueKey === undefined ||
    game.navigationLeagueKey === key
    ? key
    : undefined
}

/** Source for public choices before pagination; older servers can prove only the games they sent. */
export function availableGameLeagues(
  games: readonly GameLeague[],
  hasRacing: boolean
) {
  const keys = new Set(games.map(gameLeagueKey))
  if (hasRacing) keys.add('f1')
  return BDL_LEAGUE_KEYS.filter((key) => keys.has(key))
}

type Engagement = MarketIdentity & {
  creatorId: string
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
    const key = MANIFOLD_SPORTS_USER_IDS.includes(market.creatorId)
      ? marketLeagueKey(market)
      : undefined
    const sport = key
      ? BDL_LEAGUES[key].sportKey
      : sportForMarket({ groupIds: market.groupIds })
    if (sport !== 'other') sports.set(sport, (sports.get(sport) ?? 0) + 1)
    if (key) leagues.set(key, (leagues.get(key) ?? 0) + 1)
  }
  return { sports, leagues }
}

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
  counts: ReadonlyMap<string, number>,
  available: readonly BdlLeagueKey[]
) {
  return byEngagement(
    BDL_LEAGUE_KEYS.filter(
      (key) =>
        available.includes(key) &&
        (sport === 'all' || BDL_LEAGUES[key].sportKey === sport)
    ),
    (key) => key,
    counts
  )
}

export function leagueForSport(value: unknown, sport: string) {
  return typeof value === 'string' &&
    isBdlLeagueKey(value) &&
    (sport === 'all' || BDL_LEAGUES[value].sportKey === sport)
    ? value
    : undefined
}

/** Preserve only controls understood by the destination Sports page. */
export function sportsNavigationPath(
  path: string,
  sport: string,
  league: unknown,
  tab: unknown
) {
  const query = new URLSearchParams()
  const key = leagueForSport(league, sport)
  if (key) query.set('league', key)
  if (
    typeof tab === 'string' &&
    [
      sport === 'all' ? 'upcoming' : 'games',
      'markets',
      'leaderboards',
      'topic',
    ].includes(tab)
  )
    query.set('tab', tab)
  return query.size ? path + '?' + query.toString() : path
}

export function sportRailSections<T extends { key: string }>(
  sports: T[],
  counts: Readonly<Partial<Record<string, number>>>,
  engagement?: ReadonlyMap<string, number>
): [T[], T[]] {
  const playing = (s: T) => (counts[s.key] ?? 0) > 0
  const active = sports.filter(playing)
  const idle = sports.filter((s) => s.key !== 'other' && !playing(s))
  if (!engagement?.size) return [active, idle]
  const ranked = byEngagement([...active, ...idle], (s) => s.key, engagement)
  const i = ranked.findIndex((s) => !playing(s))
  // A divider is meaningful only when all following sports have no games.
  if (i < 0 || ranked.slice(i).some(playing)) return [ranked, []]
  return [ranked.slice(0, i), ranked.slice(i)]
}
