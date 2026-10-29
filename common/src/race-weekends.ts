import { escapeRegExp, groupBy, minBy, partition, sortBy, uniq } from 'lodash'
import { Answer } from './answer'
import {
  F1_CLOSE_BUFFER_HOURS,
  OTHER_DRIVER_ANSWER,
  parseF1EventId,
  parseF1TitleEventId,
} from './f1-markets'
import type {
  RelatedCandidate,
  RelatedGroup,
  RelatedMatch,
  RelatedRef,
} from './sports-schedule'
import { DAY_MS, HOUR_MS } from './util/time'

// ─── F1 race weekends on the sports page ────────────────────────────────────
//
// A game is one row with two teams. An F1 weekend is one event with a few
// sessions (qualifying, sprint, race), each with a winner market and the race
// with a podium market too (common/f1-markets.ts). The sports page lists each
// session like a game, under its own day, and can feature one; its card shows
// the leading drivers, and the markets people made about it under it.

/** How many leading drivers a market shows on a card. */
export const RACE_CARD_LEADERS = 3
/** How many the API sends, for the featured session. */
export const RACE_HERO_LEADERS = 6

export type RaceStatus = 'upcoming' | 'live' | 'finished'

export interface RaceMarketRef {
  id: string
  slug: string
  creatorUsername: string
  question: string
  marketType: 'winner' | 'podium'
  /** What the market asks: "Race winner", "Pole position", "Podium". */
  label: string
  isResolved: boolean
  /** The most likely answers first; on a resolved market, the winners. */
  leaders: {
    answerId: string
    name: string
    shortName: string | null
    /** 0 to 1. */
    prob: number
    color: string | null
    won: boolean
    /** "Other", or an older market's "Another driver": nobody in particular. */
    other?: boolean
  }[]
  answerCount: number
  /** Absent from an API that predates them. */
  volume?: number
  uniqueBettorCount?: number
}

export interface RaceSession {
  sessionId: number
  /** "Qualifying", "Sprint", "Race" */
  label: string
  startTime: number
  /** When its markets close: the latest close among them. */
  closeTime: number
  status: RaceStatus
  /** The winner market, then the podium. */
  markets: RaceMarketRef[]
  /**
   * Markets about the session: ones linked to its markets, then ones naming
   * its Grand Prix (findRaceRelatedMarkets). Absent from an API that predates
   * them.
   */
  related?: RelatedRef[]
  relatedCount?: number
}

export interface RaceWeekend {
  /** `bdl-f1:<event id>` */
  id: string
  sport: 'f1'
  /** "2026 Mexico City Grand Prix" */
  name: string
  /** The first session's start. */
  startTime: number
  status: RaceStatus
  /** In start order. */
  sessions: RaceSession[]
  /**
   * Its sessions' markets' topic slugs, so a page can leave out topics the
   * visitor blocked. Absent from an API that predates it.
   */
  groupSlugs?: string[]
}

/** The market fields the card is built from. */
export interface RaceContract {
  id: string
  slug: string
  creatorUsername: string
  question: string
  closeTime?: number
  isResolved?: boolean
  resolution?: string
  sportsEventId?: string
  sportsMarketType?: string
  sportsStartTimestamp?: string
  volume?: number
  uniqueBettorCount?: number
}

type SessionLabel = 'Qualifying' | 'Sprint' | 'Race' | 'Session'

/** The title endings the pipeline writes (common/f1-markets.ts), by session. */
const TITLE_TAILS: Record<string, SessionLabel> = {
  'pole position': 'Qualifying',
  'sprint winner': 'Sprint',
  'race winner': 'Race',
  podium: 'Race',
}

const WINNER_LABEL: Record<SessionLabel, string> = {
  Qualifying: 'Pole position',
  Sprint: 'Sprint winner',
  Race: 'Race winner',
  Session: 'Winner',
}

/** The weekend and what's asked, if the title is the pipeline's own. */
function parseTitle(question: string) {
  const i = question.lastIndexOf(': ')
  if (i <= 0) return undefined
  const label =
    TITLE_TAILS[
      question
        .slice(i + 2)
        .trim()
        .toLowerCase()
    ]
  return label ? { weekend: question.slice(0, i), label } : undefined
}

/**
 * Which session the markets are about. A podium only comes with a race; then
 * the title the pipeline wrote; then, for a title someone edited, how long
 * after the start the markets close (F1_CLOSE_BUFFER_HOURS, one per session
 * kind); and a neutral "Session" when nothing says.
 */
function sessionLabel(
  markets: RaceContract[],
  startTime: number,
  closeTime: number
): SessionLabel {
  if (markets.some((m) => m.sportsMarketType === 'podium')) return 'Race'
  const titled = markets.map((m) => parseTitle(m.question)?.label).find(Boolean)
  if (titled) return titled
  const hours = (closeTime - startTime) / HOUR_MS
  const BY_KIND: Record<string, SessionLabel> = {
    race: 'Race',
    sprint: 'Sprint',
    qualifying: 'Qualifying',
  }
  const kind = Object.entries(F1_CLOSE_BUFFER_HOURS).find(
    ([, h]) => Math.abs(h - hours) < 0.01
  )?.[0]
  return (kind && BY_KIND[kind]) || 'Session'
}

const finiteOr0 = (n: number | undefined) =>
  n !== undefined && Number.isFinite(n) ? Math.max(0, n) : 0

/** "Other", or the stand-in answer an older market was made with. */
const isOtherAnswer = (a: { text: string; isOther?: boolean }) =>
  !!a.isOther || a.text.trim() === OTHER_DRIVER_ANSWER

function marketRef(
  c: RaceContract,
  answers: Answer[],
  session: SessionLabel
): RaceMarketRef {
  const marketType = c.sportsMarketType === 'podium' ? 'podium' : 'winner'
  const won = (a: Answer) =>
    a.resolution === 'YES' || (marketType === 'winner' && c.resolution === a.id)
  const ranked = sortBy(answers, [
    (a) => (won(a) ? 0 : 1),
    (a) => -(Number.isFinite(a.prob) ? a.prob : 0),
    (a) => a.index,
  ])
  return {
    id: c.id,
    slug: c.slug,
    creatorUsername: c.creatorUsername,
    question: c.question,
    marketType,
    label: marketType === 'podium' ? 'Podium' : WINNER_LABEL[session],
    isResolved: !!c.isResolved,
    leaders: ranked.slice(0, RACE_HERO_LEADERS).map((a) => ({
      answerId: a.id,
      name: a.text,
      shortName: a.shortText ?? null,
      prob: Number.isFinite(a.prob) ? Math.min(1, Math.max(0, a.prob)) : 0,
      color: a.color ?? null,
      won: won(a),
      other: isOtherAnswer(a),
    })),
    answerCount: answers.length,
    volume: finiteOr0(c.volume),
    uniqueBettorCount: finiteOr0(c.uniqueBettorCount),
  }
}

function sessionStatus(
  startTime: number,
  closeTime: number,
  markets: RaceContract[],
  now: number
): RaceStatus {
  if (markets.every((m) => m.isResolved) || now >= closeTime) return 'finished'
  return now >= startTime ? 'live' : 'upcoming'
}

/**
 * The F1 weekends in `contracts`, official F1 markets (`bdl-f1:` event ids)
 * with their answers: each weekend's sessions in start order, each with its
 * winner market and podium. Live weekends come first, then the soonest next
 * session; anything that isn't an F1 market is ignored.
 */
export function buildRaceWeekends(
  contracts: RaceContract[],
  answersByContract: Record<string, Answer[]>,
  now: number
): RaceWeekend[] {
  const parsed = contracts.flatMap((c) => {
    const ids = parseF1EventId(c.sportsEventId)
    return ids ? [{ c, ...ids }] : []
  })
  const weekends = Object.values(groupBy(parsed, (p) => p.eventId)).map(
    (markets): RaceWeekend => {
      const sessions = Object.values(groupBy(markets, (p) => p.sessionId)).map(
        (group): RaceSession => {
          const cs = sortBy(
            group.map((p) => p.c),
            (c) => (c.sportsMarketType === 'podium' ? 1 : 0)
          )
          const closeTime = Math.max(...cs.map((c) => c.closeTime ?? 0))
          // Any market's start will do: they share the session's.
          const starts = cs
            .map((c) => Date.parse(c.sportsStartTimestamp ?? ''))
            .filter((t) => Number.isFinite(t))
          const startTime = starts.length > 0 ? Math.min(...starts) : closeTime
          const label = sessionLabel(cs, startTime, closeTime)
          return {
            sessionId: group[0].sessionId,
            label,
            startTime,
            closeTime,
            status: sessionStatus(startTime, closeTime, cs, now),
            markets: cs.map((c) =>
              marketRef(c, answersByContract[c.id] ?? [], label)
            ),
            related: [],
            relatedCount: 0,
          }
        }
      )
      const ordered = sortBy(sessions, (s) => s.startTime)
      const statuses = ordered.map((s) => s.status)
      // From a title the pipeline wrote, not one someone edited.
      const name =
        markets.map((p) => parseTitle(p.c.question)?.weekend).find(Boolean) ??
        'Formula 1 weekend'
      return {
        id: `bdl-f1:${markets[0].eventId}`,
        sport: 'f1',
        name,
        startTime: ordered[0].startTime,
        status: statuses.includes('live')
          ? 'live'
          : statuses.includes('upcoming')
          ? 'upcoming'
          : 'finished',
        sessions: ordered,
      }
    }
  )
  const nextStart = (w: RaceWeekend) =>
    w.sessions.find((s) => s.status !== 'finished')?.startTime ?? Infinity
  return sortBy(weekends, [
    (w) => (w.status === 'live' ? 0 : w.status === 'upcoming' ? 1 : 2),
    nextStart,
  ])
}

// ─── Sessions in the game feed ──────────────────────────────────────────────

/**
 * A session in the game feed, beside the games: sorted, filtered and featured
 * by the same fields (id, status, start, volume). Its weekend comes along for
 * the card's title and the featured card's run of sessions.
 */
export interface RaceSessionEvent {
  /** `bdl-f1:<event id>:<session id>`: its markets' sportsEventId. */
  id: string
  sport: 'f1'
  status: RaceStatus
  startTime: number
  closeTime: number
  /**
   * Traded on the session's most traded market, which is what it's ranked by
   * against games: its markets share traders, so a sum would count the same
   * people two or three times.
   */
  volume: number
  /** The same market's traders. */
  uniqueBettorCount: number
  session: RaceSession
  weekend: RaceWeekend
}

/**
 * A session's most traded market (its winner market on a tie): the one it's
 * featured for, which the featured card opens on and its card links to.
 */
export function topRaceMarket(
  session: Pick<RaceSession, 'markets'>
): RaceMarketRef | undefined {
  return session.markets.reduce<RaceMarketRef | undefined>(
    (best, m) =>
      !best || finiteOr0(m.volume) > finiteOr0(best.volume) ? m : best,
    undefined
  )
}

/**
 * A heart over several markets, as a session's card has: on while any of
 * `ids` is liked. Pressed, it likes `target` (the market the card opens), or
 * unlikes every liked one, so a like made elsewhere can be taken back too.
 */
export function raceHeart(
  ids: string[],
  target: string,
  isLiked: (id: string) => boolean
): { liked: boolean; change: string[] } {
  const on = ids.filter(isLiked)
  return on.length > 0
    ? { liked: true, change: on }
    : { liked: false, change: [target] }
}

export const raceSessionId = (
  weekend: Pick<RaceWeekend, 'id'>,
  session: Pick<RaceSession, 'sessionId'>
) => `${weekend.id}:${session.sessionId}`

/** One session of a weekend as an event, finished or not. */
export function raceSessionEvent(
  weekend: RaceWeekend,
  session: RaceSession
): RaceSessionEvent {
  const top = topRaceMarket(session)
  return {
    id: raceSessionId(weekend, session),
    sport: 'f1',
    status: session.status,
    startTime: session.startTime,
    closeTime: session.closeTime,
    volume: finiteOr0(top?.volume),
    uniqueBettorCount: finiteOr0(top?.uniqueBettorCount),
    session,
    weekend,
  }
}

/** The live and upcoming sessions of `weekends`, as feed events. */
export function raceSessionEvents(weekends: RaceWeekend[]): RaceSessionEvent[] {
  return weekends.flatMap((weekend) =>
    weekend.sessions
      .filter((s) => s.status !== 'finished')
      .map((session) => raceSessionEvent(weekend, session))
  )
}

/**
 * A weekend's markets in session order, named as the featured card's pills
 * name them: "Sprint", "Qualifying", "Race winner", "Podium".
 */
export function raceWeekendMarkets(weekend: RaceWeekend) {
  return weekend.sessions.flatMap((session) =>
    session.markets.map((market) => ({
      session,
      market,
      label:
        market.marketType === 'podium'
          ? 'Podium'
          : session.label === 'Race'
          ? 'Race winner'
          : session.label === 'Session'
          ? market.label
          : session.label,
    }))
  )
}

/** "2026 Mexico City Grand Prix" → "Mexico City Grand Prix": cards show the date. */
export const raceDisplayName = (name: string) =>
  name.replace(/^\d{4}\s+/, '') || name

/** What the feed's search matches a session on: its weekend, label, drivers. */
export function raceSessionSearchText(e: RaceSessionEvent): string {
  return [
    e.weekend.name,
    'Formula 1 F1',
    e.session.label,
    ...e.session.markets.flatMap((m) => [
      m.label,
      ...m.leaders.flatMap((l) => [l.name, l.shortName ?? '']),
    ]),
  ]
    .join(' ')
    .toLowerCase()
}

/**
 * The week's other markets without the ones on the cards being shown. The API
 * keeps F1 markets in that list, so a page that can't draw a weekend's card (an
 * older one) still lists them.
 */
export function withoutRaceMarkets<T extends { id: string }>(
  upcoming: T[],
  shown: RaceWeekend[]
): T[] {
  const onCards = new Set(
    shown.flatMap((w) => w.sessions.flatMap((s) => s.markets.map((m) => m.id)))
  )
  return upcoming.filter((m) => !onCards.has(m.id))
}

// ─── Markets people make about a Grand Prix ─────────────────────────────────
//
// Fans make plenty of markets around a race weekend: "F1 Dutch GP: Who will
// take Grand Prix pole?", "Will a full Safety Car be deployed during the
// Dutch GP?". One goes under a session when it's about F1, names the
// weekend's Grand Prix and closes during the weekend: under the sprint or
// qualifying when it says so, the race when it asks who wins, else the
// session it closes nearest to.

/** A weekend's markets close from a few days before its first session to a couple after its last. */
const RELATED_FROM_MS = 4 * DAY_MS
const RELATED_UNTIL_MS = 2 * DAY_MS

/**
 * The names people use for each Grand Prix: the adjective, the country, the
 * city or circuit. A weekend's official name ("2026 Mexico City Grand Prix")
 * picks its group by the words before "Grand Prix".
 */
const GRAND_PRIX_NAMES: string[][] = [
  ['Australian', 'Australia', 'Melbourne', 'Albert Park'],
  ['Chinese', 'China', 'Shanghai'],
  ['Japanese', 'Japan', 'Suzuka'],
  ['Bahrain', 'Bahraini', 'Sakhir'],
  ['Saudi Arabian', 'Saudi Arabia', 'Saudi', 'Jeddah'],
  ['Miami'],
  ['Emilia Romagna', 'Imola'],
  ['Canadian', 'Canada', 'Montreal'],
  ['Monaco', 'Monte Carlo'],
  ['Barcelona-Catalunya', 'Barcelona', 'Catalunya', 'Catalan'],
  ['Spanish', 'Spain', 'Madrid', 'Madring', 'Espana'],
  ['Austrian', 'Austria', 'Spielberg', 'Red Bull Ring'],
  ['British', 'Britain', 'Silverstone', 'UK'],
  ['Belgian', 'Belgium', 'Spa'],
  ['Hungarian', 'Hungary', 'Hungaroring', 'Budapest'],
  ['Dutch', 'Netherlands', 'Zandvoort'],
  ['Italian', 'Italy', 'Italia', 'Monza'],
  ['Azerbaijan', 'Baku'],
  ['Singapore', 'Marina Bay'],
  ['United States', 'US', 'USA', 'USGP', 'Austin', 'COTA'],
  ['Mexico City', 'Mexican', 'Mexico'],
  ['Sao Paulo', 'Brazilian', 'Brazil', 'Interlagos'],
  ['Las Vegas', 'Vegas'],
  ['Qatar', 'Qatari', 'Lusail'],
  ['Abu Dhabi', 'Yas Marina'],
  ['Malaysian', 'Malaysia', 'Sepang'],
  ['Portuguese', 'Portugal', 'Portimao'],
  ['Turkish', 'Turkey', 'Istanbul'],
]

/** São → Sao: people type names both ways. */
const foldAccents = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '')

/** "2026 Mexico City Grand Prix" → "Mexico City"; "… Bahrain Grand Prix in Malaysia" → "Bahrain". */
function grandPrixPlace(weekendName: string): string | undefined {
  const place = foldAccents(weekendName)
    .replace(/^\d{4}\s+/, '')
    .match(/^(.+?)\s+Grand Prix\b/i)?.[1]
    .trim()
  return place || undefined
}

/**
 * Whether a question names the weekend's Grand Prix, by any of its names.
 * Short ones (US, UK, Spa) and initialisms (COTA) count only as written.
 */
function grandPrixMatcher(weekendName: string) {
  const place = grandPrixPlace(weekendName)
  if (!place) return undefined
  const key = place.toLowerCase()
  const group = GRAND_PRIX_NAMES.find((names) =>
    names.some((n) => n.toLowerCase() === key)
  )
  const names = uniq([place, ...(group ?? [])])
  const [exact, loose] = partition(
    names,
    (n) => n.length <= 3 || /^[A-Z]+$/.test(n)
  )
  const regex = (list: string[], flags: string) =>
    list.length === 0
      ? undefined
      : new RegExp(
          `(^|[^\\p{L}\\p{N}])(${list
            .map(escapeRegExp)
            .join('|')})(?=$|[^\\p{L}\\p{N}])`,
          flags
        )
  const looseRe = regex(loose, 'iu')
  const exactRe = regex(exact, 'u')
  return (foldedQuestion: string) =>
    !!looseRe?.test(foldedQuestion) || !!exactRe?.test(foldedQuestion)
}

// A market outside the F1 topic still counts when it says it's about F1.
const F1_CONTEXT_RE = /\b(F1|Formula (1|One)|GP|Grand Prix)\b/i
// Other series race at the same Grand Prix (F2 and F3 at Monaco): a market
// naming one and not F1 isn't about the F1 sessions.
const OTHER_SERIES_RE =
  /\b(F2|F3|Formula (2|3|E|Two|Three)|F1 Academy|MotoGP|Moto[23]|IndyCar|NASCAR|WEC|Le Mans|DTM|Supercars|WRC|WSBK|Supercup)\b/i
const SAYS_F1_RE = /\b(F1|Formula (1|One))\b(?! Academy)/i
const SPRINT_RE = /\b(sprint|SQ[1-3])\b/i
const QUALIFYING_RE = /\b(pole|qualifying|quali|Q[1-3])\b/i
// "Will the winner start from pole?" is about the race.
const STARTS_FROM_RE = /\bstart(s|ing)?\s+(from|on)\s+(pole|P1)\b/i
const RACE_RE = /\b(win|wins|winner|podium|points|finish|race)\b/i

/** Who-wins markets first, then props, then the rest (the page's group order). */
const F1_PROP_RE =
  /\b(podium|top \d+|points|safety car|red flag|wet|intermediates?|tyres?|tires?|start from|DNF|retire|finish(es)?|fastest lap|overtakes?|driver of the day|pit|grid|Q[1-3]|SQ[1-3])\b/i
const F1_MAIN_RE =
  /\b(wins?|winner|pole|fastest|which constructor|which team|team of)\b/i

export function f1RelatedGroup(question: string): RelatedGroup {
  if (F1_PROP_RE.test(question)) return 'props'
  if (F1_MAIN_RE.test(question)) return 'game-lines'
  return 'community'
}

function sessionFor(weekend: RaceWeekend, question: string, closeTime: number) {
  const labelled = (label: string) =>
    weekend.sessions.find((s) => s.label === label)
  const nearest = (sessions: RaceSession[]) =>
    minBy(sessions, (s) => Math.abs(closeTime - s.startTime))
  if (SPRINT_RE.test(question)) {
    const sprint = labelled('Sprint')
    if (sprint) return sprint
  }
  const qualifying =
    QUALIFYING_RE.test(question) && !STARTS_FROM_RE.test(question)
      ? labelled('Qualifying')
      : undefined
  const race = RACE_RE.test(question) ? labelled('Race') : undefined
  // "Will the pole sitter win the race?" and "Who will win pole?" use both
  // sessions' words: the one it closes nearest to decides (F4213-07).
  if (qualifying && race) return nearest([qualifying, race])
  return qualifying ?? race ?? nearest(weekend.sessions)
}

/**
 * Markets people made about each session's Grand Prix, keyed by the session's
 * id (raceSessionId), most important first. Official markets (with an event
 * id) never match: a session's own are on its card. Nor does one about
 * another series, or naming another year's race. A market naming two
 * weekends' Grand Prix in their windows goes to the one it closes nearest.
 */
export function findRaceRelatedMarkets(
  weekends: RaceWeekend[],
  candidates: readonly RelatedCandidate[],
  limit = 25
): Map<string, RelatedMatch[]> {
  const windows = weekends.flatMap((w) => {
    const names = grandPrixMatcher(w.name)
    if (!names || w.sessions.length === 0) return []
    const lastClose = Math.max(...w.sessions.map((s) => s.closeTime))
    return [
      {
        weekend: w,
        names,
        // The season in its name ("2026 Mexico City Grand Prix").
        year:
          w.name.match(/^(\d{4})\b/)?.[1] ??
          String(new Date(w.startTime).getUTCFullYear()),
        from: w.startTime - RELATED_FROM_MS,
        until: lastClose + RELATED_UNTIL_MS,
        middle: (w.startTime + lastClose) / 2,
      },
    ]
  })
  const bySession = new Map<string, (RelatedMatch & { importance: number })[]>()
  for (const c of candidates) {
    const closeTime = c.closeTime
    if (c.sportsEventId || closeTime == null) continue
    if (
      c.sport !== 'f1' &&
      !(c.sport === 'other' && F1_CONTEXT_RE.test(c.question))
    )
      continue
    if (OTHER_SERIES_RE.test(c.question) && !SAYS_F1_RE.test(c.question))
      continue
    const years = c.question.match(/\b20\d\d\b/g)
    const question = foldAccents(c.question)
    const hits = windows.filter(
      (w) =>
        closeTime >= w.from &&
        closeTime <= w.until &&
        (!years || years.includes(w.year)) &&
        w.names(question)
    )
    const hit = minBy(hits, (w) => Math.abs(closeTime - w.middle))
    if (!hit) continue
    const session = sessionFor(hit.weekend, c.question, closeTime)
    if (!session) continue
    const id = raceSessionId(hit.weekend, session)
    const list = bySession.get(id) ?? []
    list.push({
      id: c.id,
      kind: 'event',
      group: f1RelatedGroup(c.question),
      score: 1,
      importance: c.importanceScore,
    })
    bySession.set(id, list)
  }
  return new Map(
    [...bySession].map(([id, list]) => [
      id,
      sortBy(list, (m) => -m.importance)
        .slice(0, limit)
        .map(({ id, kind, group, score }) => ({ id, kind, group, score })),
    ])
  )
}

// ─── The championship ───────────────────────────────────────────────────────

/** A season-long title market for the F1 page: the drivers' or constructors'. */
export interface RaceChampionship {
  kind: 'drivers' | 'constructors'
  id: string
}

export interface ChampionshipCandidate {
  id: string
  question: string
  uniqueBettorCount: number
  volume: number
  /**
   * The pipeline's own title market's id (`bdl-f1-title:...`), set only
   * for a market from @ManifoldSports: anyone can stamp a sportsEventId.
   */
  officialEventId?: string | null
}

const ABOUT_F1_RE = /\b(F1|Formula (1|One))\b/i
const TITLE_RE = /\b(champion|championship|WDC|WCC)\b/i
// Who wins it: a winner or the champion, not who's in the top three
// (F4213-06).
const WINS_TITLE_RE = /\b(win|wins|winner|won|champion|WDC|WCC)\b/i
const CONSTRUCTORS_RE = /\b(constructors?|constructor['’]s|WCC)\b/i
const DRIVERS_RE = /\b(drivers?|driver['’]s|WDC|world champion)\b/i
// The title itself, not when someone wins it, a finishing position or a
// yes/no on one driver.
const NOT_THE_TITLE_RE =
  /^\s*(when|how|will|in which)\b|\b(lowest|last|bottom|position|place|finish|runner[- ]up|second|third|points|top \d+|top (three|five|ten)|podium|rank|ranking|standings)\b/i

/** Constructors when it says so, drivers when it says so, else by "team". */
function championshipKind(question: string): RaceChampionship['kind'] {
  if (CONSTRUCTORS_RE.test(question)) return 'constructors'
  if (DRIVERS_RE.test(question)) return 'drivers'
  return /\bteams?\b/i.test(question) ? 'constructors' : 'drivers'
}

/** The season the page is about: from mid-December, the next one. */
export function f1Season(now: number) {
  const d = new Date(now)
  const year = d.getUTCFullYear()
  return d.getUTCMonth() === 11 && d.getUTCDate() >= 15 ? year + 1 : year
}

/**
 * The season's drivers' and constructors' title markets from open multiple
 * choice markets: our own for the season (createF1TitleMarkets) where there
 * is one, else an F1 question about the title, for this season (or no
 * season named), the one with the most traders of each kind.
 */
export function pickRaceChampionships(
  candidates: readonly ChampionshipCandidate[],
  now: number
): RaceChampionship[] {
  const season = String(f1Season(now))
  const official = candidates.flatMap((c) => {
    const title = parseF1TitleEventId(c.officialEventId)
    return title && String(title.season) === season
      ? [{ kind: title.kind, id: c.id }]
      : []
  })
  const titles = candidates.flatMap((c) => {
    if (c.officialEventId) return []
    const q = c.question
    if (
      !ABOUT_F1_RE.test(q) ||
      !TITLE_RE.test(q) ||
      !WINS_TITLE_RE.test(q) ||
      NOT_THE_TITLE_RE.test(q)
    )
      return []
    const years: string[] = q.match(/\b20\d\d\b/g) ?? []
    if (years.length > 0 && !years.includes(season)) return []
    return [{ ...c, kind: championshipKind(q) }]
  })
  const ranked = sortBy(titles, [
    (c) => -finiteOr0(c.uniqueBettorCount),
    (c) => -finiteOr0(c.volume),
    (c) => c.id,
  ])
  return (['drivers', 'constructors'] as const).flatMap((kind) => {
    const best =
      sortBy(
        official.filter((c) => c.kind === kind),
        (c) => c.id
      )[0] ?? ranked.find((c) => c.kind === kind)
    return best ? [{ kind, id: best.id }] : []
  })
}

// ─── The featured weekend's driver board ────────────────────────────────────
//
// The featured card shows a weekend the way the timing screens do: every
// driver as a row with a three-letter code and team colour, and a price per
// market (pole, race winner, podium...) to bet on from the same row.

/** Name suffixes that aren't a surname. */
const NAME_SUFFIXES = new Set(['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv'])

/**
 * A driver's three-letter code, as on the timing screens: the first three
 * letters of the surname ("Kimi Antonelli" → "ANT", "Nico Hülkenberg" →
 * "HUL").
 */
export function driverCode(name: string): string {
  const words = foldAccents(name)
    .trim()
    .split(/\s+/)
    .filter((w) => !NAME_SUFFIXES.has(w.toLowerCase()))
  const surname = (words[words.length - 1] ?? '').replace(/[^A-Za-z]/g, '')
  return surname.slice(0, 3).toUpperCase()
}

/** One of the weekend's markets, as the board reads it. */
export interface DriverBoardMarket {
  id: string
  /** Settled, or past its close: shown, but not bet on. */
  closed: boolean
  /** A winner market's resolution: the answer that won. */
  resolution?: string
  answers: {
    id: string
    text: string
    shortText?: string | null
    prob: number
    color?: string | null
    resolution?: string
    probChanges?: { day: number }
    isOther?: boolean
  }[]
}

export interface DriverBoardCell {
  answerId: string
  /** 0 to 1. */
  prob: number
  /** The move over the last day, in points of probability. */
  dayChange: number
  won: boolean
  closed: boolean
}

export interface DriverBoardRow {
  /** The driver's name, which joins their answers across markets. */
  name: string
  shortName: string
  code: string
  color: string | null
  /** The catch-all: "Other", or an older market's "Another driver". */
  other: boolean
  cells: Record<string, DriverBoardCell | undefined>
}

const clamp01 = (n: number) =>
  Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0
const finiteOr0Signed = (n: number | undefined) =>
  n !== undefined && Number.isFinite(n) ? n : 0

/**
 * Every driver of the weekend's markets as one row, with their answer in
 * each: the primary market's winners first once it settles, then its
 * favourites, then anyone it doesn't list; "Other" last.
 */
export function buildDriverBoard(
  markets: DriverBoardMarket[],
  primaryId: string
): DriverBoardRow[] {
  const rows = new Map<string, DriverBoardRow>()
  for (const market of markets) {
    for (const a of market.answers) {
      const key = foldAccents(a.text).trim().toLowerCase()
      const other = isOtherAnswer(a)
      const row = rows.get(key) ?? {
        name: a.text.trim(),
        shortName: a.text.trim(),
        code: other ? '' : driverCode(a.text),
        color: null,
        other,
        cells: {},
      }
      if (!row.color && a.color) row.color = a.color
      if (row.shortName === row.name && a.shortText) row.shortName = a.shortText
      row.cells[market.id] = {
        answerId: a.id,
        prob: clamp01(a.prob),
        dayChange: Math.round(finiteOr0Signed(a.probChanges?.day) * 100),
        won: a.resolution === 'YES' || market.resolution === a.id,
        closed: market.closed,
      }
      rows.set(key, row)
    }
  }
  const primary = (r: DriverBoardRow) => r.cells[primaryId]
  return sortBy(
    [...rows.values()],
    [
      (r) => (r.other ? 1 : 0),
      (r) => (primary(r)?.won ? 0 : 1),
      (r) => -(primary(r)?.prob ?? -1),
      (r) => -Math.max(0, ...Object.values(r.cells).map((c) => c?.prob ?? 0)),
      (r) => r.name,
    ]
  )
}
