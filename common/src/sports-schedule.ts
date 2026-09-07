import { ENV } from 'common/envs/constants'
import { DAY_MS, HOUR_MS } from 'common/util/time'

// ─── Sport categories ─────────────────────────────────────────────────────────
//
// The /sports page is organised by sport (not by topic). Each sport maps to the
// topics whose markets belong under it and to the `sportsLeague` values that
// the automated Manifold Sports pipelines stamp on game markets.

export type SportKey =
  | 'nfl'
  | 'nba'
  | 'mlb'
  | 'nhl'
  | 'soccer'
  | 'ncaaf'
  | 'ncaab'
  | 'tennis'
  | 'f1'
  | 'mma'
  | 'golf'
  | 'cricket'
  | 'other'

export interface SportCategory {
  key: SportKey
  label: string
  /** Longer label used in headings ("NFL football"). */
  longLabel: string
  emoji: string
  /** Prod topic ids that put a market under this sport, and that new markets get tagged with. */
  groupIds: string[]
  /** Old season topics: still read, so their markets show up, but never tagged onto new ones. */
  archivedGroupIds?: string[]
  /** Slug of the main topic, for "see all" links into /browse. */
  slug?: string
  /** `sportsLeague` values (from the automated pipelines) that map here. */
  leagues: string[]
  /** Whether a game can end in a draw (adds a third "Draw" price chip). */
  hasDraw?: boolean
}

// Prod topic ids. Dev has a single catch-all sports topic (see SPORTS_DEFAULT_GROUP_ID).
export const SPORTS_DEFAULT_GROUP_ID =
  ENV === 'PROD' ? '2hGlgVhIyvVaFyQAREPi' : 'IOffGO7C9c0dfDura9Yn'

export const SPORT_CATEGORIES: SportCategory[] = [
  {
    key: 'nfl',
    label: 'NFL',
    longLabel: 'NFL',
    emoji: '🏈',
    groupIds: [
      'TNQwmbE5p6dnKx2e6Qlp', // nfl
      'Vcf6CYTTSXAiStbKSqQq', // football (american)
    ],
    slug: 'nfl',
    leagues: ['NFL'],
  },
  {
    key: 'nba',
    label: 'NBA',
    longLabel: 'NBA',
    emoji: '🏀',
    groupIds: [
      'i0v3cXwuxmO9fpcInVYb', // nba
      'NjkFkdkvRvBHoeMDQ5NB', // basketball
    ],
    archivedGroupIds: ['0ac78428-c1bc-4549-aa30-416fa1df36e2'], // nba-20242025-season
    slug: 'nba',
    leagues: ['NBA', 'WNBA'],
  },
  {
    key: 'mlb',
    label: 'MLB',
    longLabel: 'MLB',
    emoji: '⚾',
    groupIds: [
      'RFwfANk54JSXOwj4qwsW', // mlb
      '786nRQzgVyUnuUtaLTGW', // baseball
    ],
    leagues: ['MLB'],
  },
  {
    key: 'nhl',
    label: 'NHL',
    longLabel: 'NHL',
    emoji: '🏒',
    groupIds: [
      'lccgApXa1l7O5ZH3XfhH', // nhl
      'tYP9jmPPjoX29KfzE4l5', // hockey
    ],
    slug: 'nhl',
    leagues: ['NHL'],
  },
  {
    key: 'soccer',
    label: 'Soccer',
    longLabel: 'Soccer',
    emoji: '⚽',
    groupIds: [
      'ypd6vR44ZzJyN9xykx6e', // soccer
      '5gsW3dPR3ySBRZCodrgm', // premier league
    ],
    archivedGroupIds: ['307ecfd7-be33-485c-884b-75c61d1f51d4'], // premier-league-20242025
    slug: 'soccer',
    leagues: [
      'Soccer',
      'English Premier League',
      'Premier League',
      'FIFA World Cup',
      'UEFA Champions League',
      'La Liga',
      'Bundesliga',
      'Serie A',
      'Ligue 1',
      'MLS',
    ],
    hasDraw: true,
  },
  {
    key: 'ncaaf',
    label: 'NCAAF',
    longLabel: 'College football',
    emoji: '🎓',
    groupIds: ['ky1VPTuxrLXMnHyajZFp'], // college football
    leagues: ['NCAAF', 'NCAA Football', 'College Football'],
  },
  {
    key: 'ncaab',
    label: 'NCAAB',
    longLabel: 'College basketball',
    emoji: '🏫',
    groupIds: ['beeb69e0-b36f-451a-80e1-e059df456bb1'], // college basketball
    leagues: ['NCAAB', 'NCAA Basketball'],
  },
  {
    key: 'tennis',
    label: 'Tennis',
    longLabel: 'Tennis',
    emoji: '🎾',
    groupIds: ['1mvN9vIVIopcWiAsXhzp'],
    leagues: ['ATP', 'WTA', 'Tennis'],
  },
  {
    key: 'f1',
    label: 'F1',
    longLabel: 'Formula 1',
    emoji: '🏎️',
    groupIds: ['OyHBKJOz9YaGkDctpwuY'],
    leagues: ['Formula 1', 'F1'],
  },
  {
    key: 'mma',
    label: 'MMA',
    longLabel: 'MMA & boxing',
    emoji: '🥊',
    groupIds: [],
    leagues: ['UFC', 'MMA', 'Boxing'],
  },
  {
    key: 'golf',
    label: 'Golf',
    longLabel: 'Golf',
    emoji: '⛳',
    groupIds: [],
    leagues: ['PGA', 'Golf'],
  },
  {
    key: 'cricket',
    label: 'Cricket',
    longLabel: 'Cricket',
    emoji: '🏏',
    groupIds: ['LcPYoqxSRdeQMms4lR3g'],
    leagues: ['Cricket', 'IPL'],
  },
]

export const SPORT_BY_KEY: Record<string, SportCategory> = Object.fromEntries(
  SPORT_CATEGORIES.map((s) => [s.key, s])
)

const LEAGUE_TO_SPORT: Record<string, SportKey> = Object.fromEntries(
  SPORT_CATEGORIES.flatMap((s) =>
    s.leagues.map((l) => [l.toLowerCase(), s.key] as const)
  )
)

// The college topics sit next to the generic "basketball" / "football" topics
// that also belong to the pro leagues, so a market tagged with both has to
// resolve to the college sport whatever order its topic ids come back in.
const SPORT_LOOKUP_ORDER: SportKey[] = [
  'ncaaf',
  'ncaab',
  ...SPORT_CATEGORIES.map((s) => s.key).filter(
    (k) => k !== 'ncaaf' && k !== 'ncaab'
  ),
]

/** Every topic id that puts a market on the sports page. */
const readGroupIds = (s: SportCategory) => [
  ...s.groupIds,
  ...(s.archivedGroupIds ?? []),
]

export const ALL_SPORTS_GROUP_IDS = [
  SPORTS_DEFAULT_GROUP_ID,
  ...SPORT_CATEGORIES.flatMap(readGroupIds),
]

// The Odds API names leagues `<sport>_<league>` (americanfootball_nfl,
// soccer_epl, basketball_ncaab). A pipeline can store that key as
// `sportsLeague` as is; the first matching prefix wins.
const ODDS_API_KEY_PREFIXES: [string, SportKey][] = [
  ['americanfootball_nfl', 'nfl'],
  ['americanfootball_ncaaf', 'ncaaf'],
  ['basketball_ncaab', 'ncaab'],
  ['basketball_', 'nba'],
  ['baseball_', 'mlb'],
  ['icehockey_', 'nhl'],
  ['soccer_', 'soccer'],
  ['tennis_', 'tennis'],
  ['mma_', 'mma'],
  ['golf_', 'golf'],
  ['cricket_', 'cricket'],
]

/** Map a market's `sportsLeague` / topic ids to a sport. */
export function sportForMarket(props: {
  sportsLeague?: string | null
  groupIds?: readonly string[] | null
}): SportKey {
  const { sportsLeague, groupIds } = props
  if (sportsLeague) {
    const league = sportsLeague.toLowerCase()
    const direct = LEAGUE_TO_SPORT[league]
    if (direct) return direct
    const prefixed = ODDS_API_KEY_PREFIXES.find(([p]) => league.startsWith(p))
    if (prefixed) return prefixed[1]
  }
  const ids = new Set(groupIds ?? [])
  if (ids.size > 0) {
    for (const key of SPORT_LOOKUP_ORDER) {
      const cat = SPORT_BY_KEY[key]
      if (cat && readGroupIds(cat).some((g) => ids.has(g))) return key
    }
  }
  return 'other'
}

/** Topic ids to search for a sport (or all sports). Falls back to the dev catch-all topic. */
export function sportGroupIds(sport: SportKey | 'all'): string[] {
  if (ENV !== 'PROD') return [SPORTS_DEFAULT_GROUP_ID]
  if (sport === 'all') return ALL_SPORTS_GROUP_IDS
  const cat = SPORT_BY_KEY[sport]
  const ids = cat ? readGroupIds(cat) : []
  return ids.length > 0 ? ids : [SPORTS_DEFAULT_GROUP_ID]
}

/** Topic ids to put on a market a pipeline creates for a sport: the current topics only, plus Sports. */
export function sportTagIds(sport: SportKey): string[] {
  if (ENV !== 'PROD') return [SPORTS_DEFAULT_GROUP_ID]
  const ids = SPORT_BY_KEY[sport]?.groupIds ?? []
  return [SPORTS_DEFAULT_GROUP_ID, ...ids]
}

// ─── Kickoff time ─────────────────────────────────────────────────────────────

/**
 * `sportsStartTimestamp` is written by two pipelines with different formats:
 * football-data.org gives a full ISO string with a Z suffix, TheSportsDB gives
 * a naive UTC timestamp with no suffix. Both are UTC.
 */
export function parseSportsStart(ts: string | null | undefined): number | null {
  if (!ts) return null
  const trimmed = ts.trim()
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed)
  const ms = Date.parse(hasZone ? trimmed : `${trimmed}Z`)
  return Number.isFinite(ms) ? ms : null
}

// ─── Team names ───────────────────────────────────────────────────────────────

const REGIONAL_INDICATOR_MIN = 0x1f1e6
const REGIONAL_INDICATOR_MAX = 0x1f1ff

/** Split "🇧🇷 Brazil" into its flag emoji and plain name. */
export function splitFlag(text: string): { flag: string; name: string } {
  const chars = [...text.trim()]
  const isRI = (c?: string) => {
    const cp = c?.codePointAt(0)
    return (
      cp !== undefined &&
      cp >= REGIONAL_INDICATOR_MIN &&
      cp <= REGIONAL_INDICATOR_MAX
    )
  }
  if (isRI(chars[0]) && isRI(chars[1])) {
    const flag = chars[0] + chars[1]
    return { flag, name: chars.slice(2).join('').trim() }
  }
  return { flag: '', name: text.trim() }
}

// Trailing words that are too generic to identify a team on their own
// ("Manchester United" → "united" would match "Newcastle United").
const GENERIC_TEAM_WORDS = new Set([
  'united',
  'city',
  'fc',
  'cf',
  'sc',
  'afc',
  'town',
  'athletic',
  'atletico',
  'atlético',
  'wanderers',
  'rovers',
  'albion',
  'state',
  'county',
  'real',
  'inter',
  'club',
  'de',
  'del',
  'la',
  'los',
  'las',
  'el',
  'the',
  'team',
  'hotspur',
  'madrid',
  'milan',
  'milano',
  'münchen',
  'munich',
  'fútbol',
  'futbol',
  'bulls',
  'tide',
  'korea',
  'ireland',
  'guinea',
  'congo',
  'sudan',
  'villa',
  'palace',
  'forest',
  'park',
  'sporting',
  'dynamo',
  'olympic',
  'olympique',
  'sd',
  'ac',
  'as',
  'ss',
  'us',
])

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * A short form of a team name for narrow layouts: "Kansas City Chiefs" →
 * "Chiefs", but "Manchester United" stays (its last word is generic).
 */
export function teamDisplayName(name: string, maxLength = 14): string {
  const plain = splitFlag(name).name.trim()
  if (plain.length <= maxLength) return plain
  // "Bosnia and Herzegovina", "Republic of Ireland": the last word misleads.
  if (/\s(and|of|&|de|del|di|da|do|e)\s/i.test(plain)) return plain
  const words = plain.split(/\s+/)
  if (words.length >= 2) {
    const last = words[words.length - 1]
    if (!GENERIC_TEAM_WORDS.has(last.toLowerCase()) && last.length >= 4) {
      return last
    }
  }
  return plain
}

// Dates carry the signs and slashes of a handicap: "[2026-09-13]" is not "-9".
const DATE_RE = /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g
const stripDates = (s: string) => s.replace(DATE_RE, ' ')

const GAME_LINE_RE =
  /\b(spread|handicap|cover|total|over\/under|o\/u|first half|1st half|second half|2nd half|half[- ]time|halftime|both teams to score|btts|margin|exact score|correct score|overtime|extra time|go to ot)\b|(?:^|[\s(])[+-]\d+(\.5)?\b/i
const PLAYER_STAT_RE =
  /\b(yards|yds|rebounds|assists|strikeouts|receptions|completions|passing|rushing|receiving|three-pointers|threes|3-pointers|saves|tackles|sacks|double-double|triple-double)\b/i
const PROP_RE =
  /\b(yards|yds|points|pts|rebounds|assists|touchdown|touchdowns|td|tds|goal|goals|score first|first (basket|goal|touchdown|to score)|anytime|hits|strikeouts|home run|hr|shots|saves|corners|cards|clean sheet|hat[- ]trick|mvp|player of the match|man of the match|interception|sack|three-pointers|threes|3-pointers|double-double|triple-double)\b/i

// ─── Draw answers ─────────────────────────────────────────────────────────────

const stripEmoji = (s: string) =>
  s.replace(/\p{Extended_Pictographic}|\p{Regional_Indicator}|️/gu, '').trim()

const DRAW_ANSWERS = new Set(['draw', 'tie', 'draw/tie', 'tie/draw'])

export function isDrawAnswer(text: string): boolean {
  return DRAW_ANSWERS.has(stripEmoji(text).toLowerCase())
}

/**
 * Names under which a team is likely to be mentioned in a user-written
 * question: the full name, the nickname (last word: "Chiefs"), the city/first
 * words ("Kansas City") and the abbreviation ("KC"). Each alias is matched as a
 * whole word; short abbreviations must appear in upper case in the question.
 */
export function teamAliases(
  name: string,
  shortText?: string | null
): { alias: string; caseSensitive: boolean }[] {
  const plain = splitFlag(name).name.replace(/\s+/g, ' ').trim()
  const out: { alias: string; caseSensitive: boolean }[] = []
  const push = (alias: string, caseSensitive = false) => {
    const a = alias.trim()
    if (!a) return
    if (out.some((o) => o.alias.toLowerCase() === a.toLowerCase())) return
    out.push({ alias: a, caseSensitive })
  }
  push(plain)
  const words = plain.split(' ')
  if (words.length >= 2) {
    const last = words[words.length - 1]
    const lastOk =
      !GENERIC_TEAM_WORDS.has(last.toLowerCase()) && last.length >= 4
    if (lastOk) push(last)
    // Two-word nicknames when the last word alone is too short or generic:
    // "Boston Red Sox" → "Red Sox", "Chicago White Sox" → "White Sox".
    if (words.length >= 3) {
      const lastTwo = words.slice(-2).join(' ')
      const penult = words[words.length - 2]
      if (
        !lastOk &&
        !GENERIC_TEAM_WORDS.has(penult.toLowerCase()) &&
        lastTwo.length >= 6
      ) {
        push(lastTwo)
      }
    }
    // No bare city alias: "Los Angeles" or "New York" alone would tie a
    // market to every team in town.
  }
  if (shortText) {
    const short = splitFlag(shortText).name.trim()
    // Two-letter codes (LA, NO, NE, SF…) are everyday words in capitals too,
    // so only three- and four-letter codes count as aliases, unless the code
    // is literally the team's name (a community market whose answer is "LA").
    if (short.length >= 3 && short.length <= 4 && /^[A-Z]+$/.test(short)) {
      push(short, true)
    } else if (short.length === 2 && short === plain) {
      push(short, true)
    } else if (short.length >= 4) {
      push(short)
    }
  }
  return out
}

/** Whole-word matchers for one team's aliases, compiled once and reused. */
export interface TeamMatcher {
  /** Lower-cased aliases for a cheap substring pre-check. */
  needles: string[]
  regexes: RegExp[]
}

export function compileTeamMatcher(
  aliases: { alias: string; caseSensitive: boolean }[]
): TeamMatcher {
  return {
    needles: aliases.map((a) => a.alias.toLowerCase()),
    regexes: aliases.map(
      ({ alias, caseSensitive }) =>
        new RegExp(
          // A ticker-style prefix ($KC, #LA, @NE) is not a team mention.
          `(^|[^\\p{L}\\p{N}#$@])${escapeRegex(alias)}(?=$|[^\\p{L}\\p{N}])`,
          caseSensitive ? 'u' : 'iu'
        )
    ),
  }
}

export function matcherMentions(
  question: string,
  matcher: TeamMatcher,
  questionLower = question.toLowerCase()
): boolean {
  if (!matcher.needles.some((n) => questionLower.includes(n))) return false
  return matcher.regexes.some((re) => re.test(question))
}

export function mentionsTeam(
  question: string,
  aliases: { alias: string; caseSensitive: boolean }[]
): boolean {
  return matcherMentions(question, compileTeamMatcher(aliases))
}

// ─── Related-market grouping ──────────────────────────────────────────────────
//
// A "game" is a market created by one of the automated pipelines (it carries a
// sportsEventId). Its related markets — props, totals, spreads, "will X score",
// community side-bets — are found by:
//   1. sharing the sportsEventId (an official prop from the pipeline), or
//   2. mentioning both teams, closing within a couple of weeks of kickoff, or
//   3. mentioning one team, closing within ~a day of kickoff.

export interface GameForMatching {
  id: string
  sport: SportKey
  sportsEventId: string
  startTime: number
  home: { name: string; shortText?: string | null }
  away: { name: string; shortText?: string | null }
}

export interface RelatedCandidate {
  id: string
  question: string
  /** Lower-cased question, precomputed by the caller when matching many games. */
  questionLower?: string
  closeTime: number | null
  sportsEventId?: string | null
  /** `sportsMarketType` stamped by a pipeline: moneyline, spread, total, prop. */
  marketType?: string | null
  /** Sport inferred from the candidate's topics; 'other' when unknown. */
  sport: SportKey
  importanceScore: number
}

export type RelatedMatchKind = 'official' | 'both-teams' | 'one-team'

/**
 * How a related market is shown under its game:
 *  - game-lines: spreads, totals, halves — the sportsbook "main lines"
 *  - props: player / team / event props ("first to score", "300+ yards")
 *  - community: anything else people made about the matchup
 */
export type RelatedGroup = 'game-lines' | 'props' | 'community'

export interface RelatedMatch {
  id: string
  kind: RelatedMatchKind
  group: RelatedGroup
  score: number
}

const GROUP_BY_MARKET_TYPE: Record<string, RelatedGroup> = {
  moneyline: 'game-lines',
  spread: 'game-lines',
  total: 'game-lines',
  prop: 'props',
}

export function relatedGroupFor(props: {
  question: string
  kind: RelatedMatchKind
  marketType?: string | null
}): RelatedGroup {
  const { question, kind, marketType } = props
  // A pipeline that stamps the type is exact; the regexes below are the guess.
  const stamped = marketType && GROUP_BY_MARKET_TYPE[marketType.toLowerCase()]
  if (stamped) return stamped
  // A player stat with a number ("300+ yards", "27.5 points") is a prop even
  // though it carries a line; team/game numbers are lines.
  const q = stripDates(question)
  if (PLAYER_STAT_RE.test(q)) return 'props'
  if (GAME_LINE_RE.test(q)) return 'game-lines'
  if (PROP_RE.test(q)) return 'props'
  // An official market we can't classify is still a prop from the pipeline.
  return kind === 'official' ? 'props' : 'community'
}

/** Compact reference shipped with the schedule; the contract is fetched on expand. */
export interface RelatedRef {
  id: string
  group: RelatedGroup
  kind: RelatedMatchKind
}

const BOTH_TEAMS_BEFORE_MS = 21 * DAY_MS
const BOTH_TEAMS_AFTER_MS = 3 * DAY_MS
const ONE_TEAM_BEFORE_MS = 12 * HOUR_MS
const ONE_TEAM_AFTER_MS = 36 * HOUR_MS

export interface GameMatchers {
  home: TeamMatcher
  away: TeamMatcher
}

export function compileGameMatchers(game: GameForMatching): GameMatchers {
  return {
    home: compileTeamMatcher(teamAliases(game.home.name, game.home.shortText)),
    away: compileTeamMatcher(teamAliases(game.away.name, game.away.shortText)),
  }
}

export function matchRelatedMarket(
  game: GameForMatching,
  candidate: RelatedCandidate,
  matchers: GameMatchers = compileGameMatchers(game)
): RelatedMatch | null {
  if (candidate.id === game.id) return null
  const withGroup = (kind: RelatedMatchKind, score: number): RelatedMatch => ({
    id: candidate.id,
    kind,
    group: relatedGroupFor({
      question: candidate.question,
      kind,
      marketType: candidate.marketType,
    }),
    score,
  })
  if (candidate.sportsEventId) {
    return game.sportsEventId && candidate.sportsEventId === game.sportsEventId
      ? withGroup('official', 3)
      : null
  }
  // Nicknames are shared across sports (Giants, Jets, Rangers, Cardinals…), so
  // a candidate that clearly belongs to a different sport never matches.
  if (candidate.sport !== 'other' && candidate.sport !== game.sport) return null

  const closeTime = candidate.closeTime ?? Infinity
  const delta = closeTime - game.startTime
  const questionLower =
    candidate.questionLower ?? candidate.question.toLowerCase()
  const homeHit = matcherMentions(
    candidate.question,
    matchers.home,
    questionLower
  )
  const awayHit = matcherMentions(
    candidate.question,
    matchers.away,
    questionLower
  )
  if (homeHit && awayHit) {
    if (delta >= -BOTH_TEAMS_BEFORE_MS && delta <= BOTH_TEAMS_AFTER_MS) {
      return withGroup('both-teams', 2)
    }
    return null
  }
  if (homeHit || awayHit) {
    if (delta >= -ONE_TEAM_BEFORE_MS && delta <= ONE_TEAM_AFTER_MS) {
      return withGroup('one-team', 1)
    }
  }
  return null
}

/** Related markets for a game, best matches first. */
export function findRelatedMarkets(
  game: GameForMatching,
  candidates: readonly RelatedCandidate[],
  limit = 25
): RelatedMatch[] {
  const matchers = compileGameMatchers(game)
  const matches: (RelatedMatch & { importance: number })[] = []
  for (const c of candidates) {
    const m = matchRelatedMarket(game, c, matchers)
    if (m) matches.push({ ...m, importance: c.importanceScore })
  }
  matches.sort((a, b) => b.score - a.score || b.importance - a.importance)
  return matches.slice(0, limit).map(({ id, kind, group, score }) => ({
    id,
    kind,
    group,
    score,
  }))
}

// ─── API types ────────────────────────────────────────────────────────────────

export type GameStatus = 'live' | 'upcoming' | 'finished'

export interface ScheduleTeam {
  answerId: string
  name: string
  shortName: string
  flag: string
  imageUrl: string | null
  prob: number
}

export interface ScheduleGame {
  id: string
  slug: string
  creatorUsername: string
  question: string
  sport: SportKey
  league: string
  /**
   * A binary market (YES is the home team, NO the away team) rather than a
   * multiple-choice one with an answer per side. The team `answerId`s are
   * then 'YES' and 'NO', and bets go through the binary dialog.
   */
  binary: boolean
  sportsEventId: string
  /** Kickoff when known; otherwise the market's close time. */
  startTime: number
  kickoffKnown: boolean
  closeTime: number
  status: GameStatus
  isResolved: boolean
  /** Answer id that resolved YES, if resolved. */
  winnerAnswerId: string | null
  resolutionTime: number | null
  home: ScheduleTeam
  away: ScheduleTeam
  draw: { answerId: string; prob: number } | null
  volume: number
  uniqueBettorCount: number
  liveScore: {
    home: number | null
    away: number | null
    minute: string | null
    status: string
  } | null
  finalScore: { home: number; away: number } | null
  /** Related markets, best matches first. */
  related: RelatedRef[]
  relatedCount: number
}

/**
 * A market in the sports topics closing within the week that is not a game
 * row and not attached to one. The page loads the contract by id.
 */
export interface UpcomingMarketRef {
  id: string
  closeTime: number
  sport: SportKey
}

export interface SportsScheduleResponse {
  games: ScheduleGame[]
  /** This week's unattached markets for the requested sport, soonest first. */
  upcoming: UpcomingMarketRef[]
  /** Live and upcoming games plus this week's markets per sport, for the rail badges. */
  counts: Partial<Record<SportKey, number>>
  liveCount: number
}

// football-data live statuses that mean a match is in play (there is no
// HALF_TIME status; the break is PAUSED).
export const LIVE_STATUSES = new Set(['IN_PLAY', 'PAUSED'])
export const TERMINAL_STATUSES = new Set(['FINISHED', 'AWARDED'])
export const LIVE_STALE_MS = 10 * 60 * 1000

export function gameStatus(props: {
  startTime: number
  closeTime: number
  isResolved: boolean
  liveStatus?: string | null
  liveUpdatedTime?: number | null
  now?: number
}): GameStatus {
  const { startTime, closeTime, isResolved, liveStatus, liveUpdatedTime } =
    props
  const now = props.now ?? Date.now()
  if (isResolved) return 'finished'
  if (liveStatus && TERMINAL_STATUSES.has(liveStatus)) return 'finished'
  const freshLive =
    !!liveStatus &&
    LIVE_STATUSES.has(liveStatus) &&
    liveUpdatedTime != null &&
    now - liveUpdatedTime < LIVE_STALE_MS
  if (freshLive) return 'live'
  if (now >= closeTime) return 'finished'
  if (now >= startTime) return 'live'
  return 'upcoming'
}
