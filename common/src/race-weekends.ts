import {
  escapeRegExp,
  groupBy,
  maxBy,
  minBy,
  partition,
  sortBy,
  sumBy,
  uniq,
} from 'lodash'
import { Answer } from './answer'
import { F1_CLOSE_BUFFER_HOURS, parseF1EventId } from './f1-markets'
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
  /** Traded on the session's own markets. */
  volume: number
  uniqueBettorCount: number
  session: RaceSession
  weekend: RaceWeekend
}

export const raceSessionId = (
  weekend: Pick<RaceWeekend, 'id'>,
  session: Pick<RaceSession, 'sessionId'>
) => `${weekend.id}:${session.sessionId}`

/** The live and upcoming sessions of `weekends`, as feed events. */
export function raceSessionEvents(weekends: RaceWeekend[]): RaceSessionEvent[] {
  return weekends.flatMap((weekend) =>
    weekend.sessions
      .filter((s) => s.status !== 'finished')
      .map((session) => ({
        id: raceSessionId(weekend, session),
        sport: 'f1' as const,
        status: session.status,
        startTime: session.startTime,
        closeTime: session.closeTime,
        volume: sumBy(session.markets, (m) => finiteOr0(m.volume)),
        uniqueBettorCount:
          maxBy(session.markets.map((m) => finiteOr0(m.uniqueBettorCount))) ??
          0,
        session,
        weekend,
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
  if (SPRINT_RE.test(question)) {
    const sprint = labelled('Sprint')
    if (sprint) return sprint
  }
  if (QUALIFYING_RE.test(question) && !STARTS_FROM_RE.test(question)) {
    const qualifying = labelled('Qualifying')
    if (qualifying) return qualifying
  }
  if (RACE_RE.test(question)) {
    const race = labelled('Race')
    if (race) return race
  }
  return minBy(weekend.sessions, (s) => Math.abs(closeTime - s.startTime))
}

/**
 * Markets people made about each session's Grand Prix, keyed by the session's
 * id (raceSessionId), most important first. Official markets (with an event
 * id) never match: a session's own are on its card. A market naming two
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
    const question = foldAccents(c.question)
    const hits = windows.filter(
      (w) => closeTime >= w.from && closeTime <= w.until && w.names(question)
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
}

const ABOUT_F1_RE = /\b(F1|Formula (1|One))\b/i
const TITLE_RE = /\b(champion|championship|WDC|WCC)\b/i
const CONSTRUCTORS_RE = /\b(constructors?|constructor['’]s|WCC)\b/i
const DRIVERS_RE = /\b(drivers?|driver['’]s|WDC|world champion)\b/i
// The title itself, not when someone wins it, a finishing position or a
// yes/no on one driver.
const NOT_THE_TITLE_RE =
  /^\s*(when|how|will|in which)\b|\b(lowest|last|bottom|position|place|finish|runner[- ]up|second|third|points)\b/i

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
 * choice markets: an F1 question about the title, for this season (or no
 * season named), the one with the most traders of each kind.
 */
export function pickRaceChampionships(
  candidates: readonly ChampionshipCandidate[],
  now: number
): RaceChampionship[] {
  const season = String(f1Season(now))
  const titles = candidates.flatMap((c) => {
    const q = c.question
    if (!ABOUT_F1_RE.test(q) || !TITLE_RE.test(q) || NOT_THE_TITLE_RE.test(q))
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
    const best = ranked.find((c) => c.kind === kind)
    return best ? [{ kind, id: best.id }] : []
  })
}
