import { groupBy, sortBy } from 'lodash'
import { Answer } from './answer'
import { F1_CLOSE_BUFFER_HOURS, parseF1EventId } from './f1-markets'
import { HOUR_MS } from './util/time'

// ─── F1 race weekends on the sports page ────────────────────────────────────
//
// A game is one row with two teams. An F1 weekend is one event with a few
// sessions (qualifying, sprint, race), each with a winner market and the race
// with a podium market too (common/f1-markets.ts). The sports page shows a
// weekend as one card: its sessions in order, each with the leading drivers.

/** How many leading drivers a market shows on the card. */
export const RACE_CARD_LEADERS = 3

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
    leaders: ranked.slice(0, RACE_CARD_LEADERS).map((a) => ({
      answerId: a.id,
      name: a.text,
      shortName: a.shortText ?? null,
      prob: Number.isFinite(a.prob) ? Math.min(1, Math.max(0, a.prob)) : 0,
      color: a.color ?? null,
      won: won(a),
    })),
    answerCount: answers.length,
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

/**
 * Where a weekend sits in the game feed: at its live session's start, else
 * its next session's, so it files under the day of what's on next.
 */
export function raceWeekendTime(w: RaceWeekend): number {
  const next =
    w.sessions.find((s) => s.status === 'live') ??
    w.sessions.find((s) => s.status === 'upcoming')
  return next?.startTime ?? w.startTime
}

/** What the feed's search matches a weekend on: name, sessions, drivers. */
export function raceWeekendSearchText(w: RaceWeekend): string {
  return [
    w.name,
    'Formula 1 F1',
    ...w.sessions.flatMap((s) => [
      s.label,
      ...s.markets.flatMap((m) =>
        m.leaders.flatMap((l) => [l.name, l.shortName ?? ''])
      ),
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
