import {
  BDL_LEAGUES,
  BDL_LEAGUE_KEYS,
  BdlLeagueKey,
  isBdlLeagueKey,
} from './leagues'
import {
  legacyOddsLeagueLabel,
  oddsLeagueLabelForKey,
} from '../sports-league-label'
import { parseBdlEventId } from '../sports-ids'
import {
  f1EventId,
  f1TitleEventId,
  parseF1EventId,
  parseF1TitleEventId,
} from '../f1-markets'
import type { Contract } from '../contract'
import { isMultiCpmm, isSportsContract } from '../contract'
import { f1Season, type RaceChampionship } from '../race-weekends'
import type { RaceWeekend } from '../race-weekends'
import { providerOf, SportsProvider } from '../sports-provider'
import {
  ScheduleGame,
  SportInfo,
  SportsSubtopic,
  SportsScheduleResponse,
  SPORTS_DEFAULT_GROUP_ID,
  SPORT_LOOKUP_ORDER,
  sportForMarket,
} from '../sports-schedule'
import { MANIFOLD_SPORTS_USER_IDS, WORLD_CUP_2026 } from '../sports'

export const LEAGUE_NAVIGATION_VERSION = 1

const aliases = new Map<string, BdlLeagueKey>()
for (const key of BDL_LEAGUE_KEYS) {
  const league = BDL_LEAGUES[key]
  for (const name of [key, league.label, league.shortLabel])
    aliases.set(name.toLowerCase(), key)
}
for (const [name, key] of [
  [WORLD_CUP_2026.sportsLeague, 'fifa/worldcup'],
  ['English Premier League', 'epl'],
  ['UEFA Champions League', 'ucl'],
  ['NCAA Football', 'ncaaf'],
  ['NCAA Basketball', 'ncaab'],
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
  sportsMarketType?: string | null
}

/** Only an unprefixed legacy event can fall back to its historical league label. */
export function marketLeagueKey(
  market: MarketIdentity
): BdlLeagueKey | undefined {
  const id = market.sportsEventId
  if (
    typeof id !== 'string' ||
    !id ||
    market.sportsFixture ||
    (market.sportsLeague != null && typeof market.sportsLeague !== 'string')
  )
    return
  const inferred = providerOf({ sportsEventId: id })
  const provider = providerOf(market)
  if (
    provider === 'fixture' ||
    (inferred !== 'legacy' && inferred !== provider)
  )
    return
  const rawLabel = market.sportsLeague?.trim().toLowerCase()
  const storedOdds = oddsLeagueLabelForKey(rawLabel ?? '')
  const label = aliases.get(storedOdds?.toLowerCase() ?? rawLabel ?? '')
  const key =
    provider === 'bdl'
      ? parseBdlEventId(id)?.league ?? canonicalF1League(id)
      : provider === 'odds'
      ? aliases.get(legacyOddsLeagueLabel(id)?.toLowerCase() ?? '')
      : provider === 'football-data'
      ? /^fd-[1-9]\d*$/.test(id) &&
        (label === 'fifa/worldcup' || label === 'epl' || label === 'ucl')
        ? label
        : undefined
      : provider === 'legacy' && /^[1-9]\d*$/.test(id)
      ? label
      : undefined
  if (
    (market.sportsLeagueKey != null && market.sportsLeagueKey !== key) ||
    (key &&
      BDL_LEAGUES[key].archetype.startsWith('team-') &&
      market.sportsMarketType != null &&
      market.sportsMarketType !== 'moneyline') ||
    (provider === 'legacy' && key === 'f1') ||
    (storedOdds && !label) ||
    (label && label !== key) ||
    (key && rawLabel && !label && !compatibleFamily(rawLabel, key))
  )
    return
  return key
}

// The Sports feed has separate chips for NBA/college leagues and their generic family.
function compatibleFamily(raw: string, key: BdlLeagueKey) {
  const family =
    (
      {
        baseball: 'baseball',
        hockey: 'hockey',
        esports: 'esports',
        'american football': 'football',
        motorsport: 'f1',
        motorsports: 'f1',
      } as Readonly<Record<string, string>>
    )[raw] ?? sportForMarket({ sportsLeague: raw })
  const league = BDL_LEAGUES[key]
  if (family === 'other') return true
  if (family === league.sportKey) return true
  return (
    (family === 'basketball' &&
      ['nba', 'wnba', 'ncaab', 'wncaab'].includes(league.sportKey)) ||
    (family === 'football' && ['nfl', 'ncaaf'].includes(league.sportKey)) ||
    (family === 'hockey' && league.sportKey === 'nhl') ||
    (family === 'baseball' && (key === 'mlb' || key === 'cbb'))
  )
}

function canonicalF1League(id: string) {
  const session = parseF1EventId(id)
  if (session && f1EventId(session.eventId, session.sessionId) === id)
    return 'f1'
  const title = parseF1TitleEventId(id)
  return title && f1TitleEventId(title.season, title.kind) === id
    ? 'f1'
    : undefined
}

/** Revalidate the hydrated public contract before exposing a title ticket. */
export function verifiedRaceTitle(
  c: Contract,
  kind: RaceChampionship['kind'],
  now: number
) {
  return (
    MANIFOLD_SPORTS_USER_IDS.includes(c.creatorId) &&
    isMultiCpmm(c) &&
    isSportsContract(c) &&
    c.visibility === 'public' &&
    c.token === 'MANA' &&
    !c.deleted &&
    !c.isResolved &&
    !c.resolution &&
    typeof c.closeTime === 'number' &&
    c.closeTime > now &&
    (c.sportsMarketType == null || c.sportsMarketType === 'title') &&
    c.outcomeType === 'MULTIPLE_CHOICE' &&
    c.shouldAnswersSumToOne !== false &&
    marketLeagueKey(c) === 'f1' &&
    c.sportsEventId === f1TitleEventId(f1Season(now), kind)
  )
}

type GameLeague = Pick<
  ScheduleGame,
  | 'leagueNavigationVersion'
  | 'navigationLeagueKey'
  | 'sportsLeagueKey'
  | 'league'
  | 'sportsEventId'
>
export function gameLeagueKey(game: GameLeague) {
  const key = marketLeagueKey({ ...game, sportsLeague: game.league })
  return game.navigationLeagueKey === undefined ||
    game.navigationLeagueKey === key
    ? key
    : undefined
}

// Older schedule DTOs discarded the original provider and league stamps.
// Identical event text can therefore represent either a valid row or a conflict.
export function publishedGameLeagueKey(game: GameLeague) {
  if (
    game.leagueNavigationVersion !== LEAGUE_NAVIGATION_VERSION ||
    game.navigationLeagueKey == null
  )
    return undefined
  const league = gameLeagueKey(game)
  // F1 uses the verified session/title projections, never the team board.
  return league === 'f1' ? undefined : league
}

/** Source for public choices before pagination; older servers can prove only the games they sent. */
export function availableGameLeagues(
  games: readonly GameLeague[],
  hasRacing: boolean
) {
  const keys = new Set<BdlLeagueKey | undefined>(
    games.map(publishedGameLeagueKey)
  )
  // Two-answer legacy rows alone cannot identify an eligible F1 session or title.
  if (hasRacing) keys.add('f1')
  else keys.delete('f1')
  return BDL_LEAGUE_KEYS.filter((key) => keys.has(key))
}

/** Previous workers may attach a league stamp without checking the payout or conflicting provider key. */
export function scheduleLeagueCatalogue(schedule?: SportsScheduleResponse) {
  const current =
    schedule?.leagueNavigationVersion === LEAGUE_NAVIGATION_VERSION
  const confirmed = current ? schedule.availableLeagues : undefined
  const verifiedRaceIds = new Set(current ? schedule.verifiedRaceMarketIds : [])
  const incomplete =
    !current ||
    !confirmed ||
    !schedule.verifiedRaceMarketIds ||
    !!schedule.unverifiedLeaguePage ||
    schedule.games.some(
      (g) =>
        g.leagueNavigationVersion !== LEAGUE_NAVIGATION_VERSION ||
        g.navigationLeagueKey === undefined
    )
  const loaded = availableGameLeagues(
    (schedule?.games ?? []).filter((g) => g.status !== 'finished'),
    verifiedRaceIds.size > 0
  )
  const remaining = schedule?.nextCursor || incomplete ? confirmed ?? [] : []
  const available = [
    ...new Set([
      ...loaded,
      ...remaining.filter((key) => key !== 'f1' || verifiedRaceIds.size > 0),
    ]),
  ]
  return { available, verifiedRaceIds, incomplete }
}

export function verifiedRaceWeekends(
  weekends: readonly RaceWeekend[],
  ids: ReadonlySet<string>
): RaceWeekend[] {
  return weekends.flatMap((weekend) => {
    const sessions = weekend.sessions.flatMap((session) => {
      const markets = session.markets.filter((m) => ids.has(m.id))
      if (!markets.length) return []
      if (markets.length === session.markets.length) return [session]
      const retained = new Set(markets.map((m) => m.id))
      const related = (session.related ?? []).flatMap((r) => {
        const parents = r.parentMarketIds?.filter((id) => retained.has(id))
        return parents?.length ? [{ ...r, parentMarketIds: parents }] : []
      })
      return [{ ...session, markets, related, relatedCount: related.length }]
    })
    return sessions.length
      ? [
          {
            ...weekend,
            sessions,
            startTime: sessions[0].startTime,
            status: sessions.some((s) => s.status === 'live')
              ? 'live'
              : sessions[0].status,
          },
        ]
      : []
  })
}

export function gameLeagueLabel(game: GameLeague) {
  const league = publishedGameLeagueKey(game)
  return league ? BDL_LEAGUES[league].label : game.league
}

type Engagement = MarketIdentity & {
  creatorId: string
  id: string
  groupIds?: readonly string[]
  groupSlugs?: readonly string[]
}
type EngagementTaxonomy = {
  sports: readonly SportInfo[]
  topics?: readonly SportsSubtopic[]
}
export function sportsEngagement(
  markets: readonly Engagement[],
  index?: EngagementTaxonomy
) {
  const topics = new Map<string, string>()
  const slugs = new Map<string, string>()
  // The common Sports topic is a cross-sport fallback in dev. Only a specific topic establishes a sport.
  const ranks = new Map<string, number>(
    SPORT_LOOKUP_ORDER.map((key, i) => [key, i])
  )
  for (const [i, sport] of (index?.sports ?? []).entries())
    if (!ranks.has(sport.key))
      ranks.set(sport.key, SPORT_LOOKUP_ORDER.length + i)
  const rankedSports = [...(index?.sports ?? [])].sort(
    (a, b) => ranks.get(a.key)! - ranks.get(b.key)!
  )
  for (const sport of rankedSports)
    for (const id of sport.groupIds)
      if (id !== SPORTS_DEFAULT_GROUP_ID && !topics.has(id))
        topics.set(id, sport.key)
  for (const sport of index?.sports ?? [])
    if (sport.slug) slugs.set(sport.slug, sport.key)
  for (const topic of index?.topics ?? []) {
    const filing = topic.filingSport ?? topics.get(topic.id) ?? topic.sport
    if (filing !== 'all') {
      topics.set(topic.id, filing)
      slugs.set(topic.slug, filing)
    }
  }

  const sports = new Map<string, number>()
  const leagues = new Map<string, number>()
  const seen = new Set<string>()
  for (const market of markets) {
    if (seen.has(market.id) || market.sportsFixture) continue
    seen.add(market.id)
    const key = MANIFOLD_SPORTS_USER_IDS.includes(market.creatorId)
      ? marketLeagueKey(market)
      : undefined
    let sport: string = key ? BDL_LEAGUES[key].sportKey : 'other'
    if (!key) {
      const candidates = new Set([
        ...(market.groupIds?.map((id) => topics.get(id)) ?? []),
        ...(market.groupSlugs?.map((slug) => slugs.get(slug)) ?? []),
      ])
      const fromIds = sportForMarket({ groupIds: market.groupIds })
      if (fromIds !== 'other') candidates.add(fromIds)
      sport =
        [...candidates]
          .filter((s): s is string => s !== undefined)
          .sort(
            (a, b) => (ranks.get(a) ?? Infinity) - (ranks.get(b) ?? Infinity)
          )[0] ?? 'other'
    }
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
  const key = leagueForSport(
    league,
    path.split('/').length === 4 ? 'all' : sport
  )
  if (key) query.set('league', key)
  if (
    typeof tab === 'string' &&
    [
      path === '/sports' ? 'upcoming' : 'games',
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
