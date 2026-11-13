import { removeEmojis } from './util/string'
import {
  AnySportKey,
  SPORT_BY_KEY,
  SportInfo,
  SportKey,
  SportSelection,
  SportsIndex,
  SportsScheduleResponse,
  SportsSubtopic,
  sportPath,
  sportTopicPath,
} from './sports-schedule'

// ─── Searching for a sports hub ───────────────────────────────────────────────
//
// A search for a sport ("nba", "formula one") or for a topic with its own page
// on /sports ("premier league", "super bowl") is a search for that page, and
// for its games: their titles ("Lakers at Celtics, Nov 14") never name the
// league, so no keyword search finds them. The web search shows the hub as its
// first result, and the market search puts the hub's live and upcoming games
// first.

/** A page on /sports that a search names. */
export type SportsHub = {
  /** The page: /sports, a sport's page, or a topic's page under its sport. */
  path: string
  /** "NBA", "Premier League", "Sports". */
  label: string
  emoji: string
} & (
  | { kind: 'all' }
  | { kind: 'sport'; sport: AnySportKey }
  | {
      kind: 'topic'
      topicId: string
      /** The sport its page opens under. */
      sport: SportSelection
      /** It and every topic under it: what its page covers. */
      groupIds: string[]
    }
)

type HubIndex = {
  sports: readonly Pick<
    SportInfo,
    'key' | 'label' | 'longLabel' | 'emoji' | 'slug'
  >[]
  topics?: readonly Pick<
    SportsSubtopic,
    'id' | 'slug' | 'label' | 'emoji' | 'sport' | 'groupIds'
  >[]
}

/**
 * Words around a hub's name that don't change which hub is meant: "nba games
 * tonight", "the nfl", "live f1".
 */
const FILLER_WORDS = new Set([
  'the',
  'live',
  'today',
  'tonight',
  'tomorrow',
  'game',
  'games',
  'match',
  'matches',
  'fixture',
  'fixtures',
  'race',
  'races',
  'fight',
  'fights',
  'schedule',
  'odds',
  'score',
  'scores',
  'hub',
  'market',
  'markets',
  'bet',
  'bets',
  'betting',
  'prediction',
  'predictions',
])

/** Longer than any hub's name: such a query is about something else. */
const MAX_HUB_QUERY_LENGTH = 60

/**
 * Other names for a curated sport, beside its label, its main topic's slug
 * and its leagues. A topic under Sports with the name wins over these: once
 * the topic tree has loaded, "baseball" opens the Baseball topic's page.
 */
const SPORT_ALIASES: Partial<Record<SportKey, string[]>> = {
  f1: ['formula one'],
  mlb: ['baseball'],
  nhl: ['hockey'],
  ncaaf: ['cfb'],
  ncaab: ['cbb'],
  soccer: ['epl', 'ucl', 'champions league'],
}

/** Lowercase words with no emoji or punctuation: how hub names are compared. */
const words = (text: string) =>
  removeEmojis(text)
    .toLowerCase()
    // "N.B.A.", "Women's": the marks join a word rather than split it.
    .replace(/['’.]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)

const nameKey = (text: string) => words(text).join(' ')

/**
 * The forms of a search to compare with hub names: as typed, then without
 * filler words around it ("nba games" → "nba"). Empty for no search.
 */
export function sportsQueryForms(term: string): string[] {
  const all = words(term)
  const exact = all.join(' ')
  if (!exact || exact.length > MAX_HUB_QUERY_LENGTH) return []
  let start = 0
  let end = all.length
  while (end - start > 1 && FILLER_WORDS.has(all[start])) start++
  while (end - start > 1 && FILLER_WORDS.has(all[end - 1])) end--
  const trimmed = all.slice(start, end).join(' ')
  return trimmed === exact ? [exact] : [exact, trimmed]
}

const sportAliases = (key: AnySportKey) => {
  const cat = SPORT_BY_KEY[key]
  if (!cat) return []
  return [...cat.leagues, ...(SPORT_ALIASES[cat.key] ?? [])].map(nameKey)
}

/**
 * The hub a search names, if any. In order, a match on: /sports itself; a
 * sport's main topic (by slug); another topic under Sports (by name or slug),
 * so the "Football" topic that holds soccer and the NFL wins over the sport
 * labelled Football; a sport's label; and its leagues and other names.
 * Without the topic tree (`index.topics` absent) only sports can match.
 */
export function findSportsHub(
  term: string,
  index: HubIndex
): SportsHub | undefined {
  const sports = index.sports.filter((s) => s.key !== 'other')
  const sportHub = (s: (typeof sports)[number]): SportsHub => ({
    kind: 'sport',
    sport: s.key,
    path: sportPath(s.key),
    label: s.label,
    emoji: s.emoji,
  })
  for (const q of sportsQueryForms(term)) {
    if (q === 'sports' || q === 'sport')
      return {
        kind: 'all',
        path: sportPath('all'),
        label: 'Sports',
        emoji: '🏟️',
      }
    const bySlug = sports.find((s) => s.slug && nameKey(s.slug) === q)
    if (bySlug) return sportHub(bySlug)
    const topic = index.topics?.find(
      (t) => nameKey(t.label) === q || nameKey(t.slug) === q
    )
    if (topic)
      return {
        kind: 'topic',
        topicId: topic.id,
        sport: topic.sport,
        groupIds: topic.groupIds,
        path: sportTopicPath(topic.sport, topic.slug),
        label: topic.label,
        emoji: topic.emoji ?? sportEmoji(topic.sport, index),
      }
    const byName = sports.find(
      (s) => nameKey(s.label) === q || nameKey(s.longLabel) === q
    )
    if (byName) return sportHub(byName)
    const byAlias = sports.find((s) => sportAliases(s.key).includes(q))
    if (byAlias) return sportHub(byAlias)
  }
  return undefined
}

const sportEmoji = (sport: SportSelection, index: HubIndex) =>
  index.sports.find((s) => s.key === sport)?.emoji ?? '🏟️'

/**
 * Which official games a hub shows, as its page does: a curated sport's by
 * league (what the pipelines stamp in `sportsLeague`), another sport's and a
 * topic's by their topics, and every game for /sports. Undefined when the hub
 * can have none.
 */
export function sportsHubGames(
  hub: SportsHub,
  index?: Pick<SportsIndex, 'sportByTopicId'>
): { sportsLeagues?: string[]; groupIds?: string[] } | undefined {
  if (hub.kind === 'all') return {}
  if (hub.kind === 'topic')
    return hub.groupIds.length > 0 ? { groupIds: hub.groupIds } : undefined
  const cat = SPORT_BY_KEY[hub.sport]
  if (cat)
    return cat.leagues.length > 0 ? { sportsLeagues: cat.leagues } : undefined
  const groupIds = Object.entries(index?.sportByTopicId ?? {})
    .filter(([, sport]) => sport === hub.sport)
    .map(([id]) => id)
  return groupIds.length > 0 ? { groupIds } : undefined
}

// ─── What's on at a hub ───────────────────────────────────────────────────────

export interface SportsHubStatus {
  live: number
  upcoming: number
  /** There are more upcoming than `upcoming` (a topic's page only says so). */
  moreUpcoming: boolean
  /** When the next one that isn't live yet starts. */
  nextStart?: number
  /** What the hub's events are called: games, matches, sessions… */
  noun: { one: string; many: string }
}

const NOUNS: Partial<Record<SportKey, [string, string]>> = {
  soccer: ['match', 'matches'],
  tennis: ['match', 'matches'],
  cricket: ['match', 'matches'],
  afl: ['match', 'matches'],
  nrl: ['match', 'matches'],
  handball: ['match', 'matches'],
  mma: ['fight', 'fights'],
  f1: ['session', 'sessions'],
  golf: ['event', 'events'],
}

/**
 * Live and upcoming games at a hub, from the first page of its schedule
 * (`sports-schedule` for its sport, or its topic): every live game is on that
 * page, and the counts give the upcoming total for a sport or all of them.
 * F1 sessions count like games.
 */
export function sportsHubStatus(
  hub: SportsHub,
  schedule: Pick<
    SportsScheduleResponse,
    'games' | 'raceWeekends' | 'counts' | 'nextCursor'
  >,
  now = Date.now()
): SportsHubStatus {
  const events = [
    ...schedule.games.map((g) => ({ status: g.status, start: g.startTime })),
    ...(schedule.raceWeekends ?? []).flatMap((w) =>
      w.sessions.map((s) => ({ status: s.status, start: s.startTime }))
    ),
  ]
  const live = events.filter((e) => e.status === 'live').length
  const listed = events.filter((e) => e.status === 'upcoming')
  const starts = listed.map((e) => e.start).filter((t) => t > now)
  const counted =
    hub.kind === 'sport'
      ? schedule.counts[hub.sport] ?? 0
      : hub.kind === 'all'
      ? Object.values(schedule.counts).reduce<number>(
          (sum, n) => sum + (n ?? 0),
          0
        )
      : undefined
  const [one, many] = NOUNS[
    (hub.kind === 'all' ? '' : hub.sport) as SportKey
  ] ?? ['game', 'games']
  return {
    live,
    upcoming:
      counted === undefined
        ? listed.length
        : Math.max(listed.length, counted - live),
    moreUpcoming: counted === undefined && !!schedule.nextCursor,
    nextStart: starts.length > 0 ? Math.min(...starts) : undefined,
    noun: { one, many },
  }
}
