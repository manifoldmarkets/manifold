import { groupBy, sortBy } from 'lodash'
import { Answer } from './answer'
import { parseF1EventId } from './f1-markets'

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

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** What follows the weekend in a title: "race winner", "pole position". */
const titleTail = (question: string) => {
  const i = question.lastIndexOf(': ')
  return i >= 0 ? question.slice(i + 2).trim() : ''
}

function sessionLabel(markets: RaceContract[]): string {
  const tails = markets.map((m) => titleTail(m.question).toLowerCase())
  if (tails.some((t) => t.includes('pole'))) return 'Qualifying'
  if (tails.some((t) => t.includes('sprint'))) return 'Sprint'
  return 'Race'
}

function marketRef(c: RaceContract, answers: Answer[]): RaceMarketRef {
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
    label: titleCase(titleTail(c.question)) || titleCase(marketType),
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
          const start = Date.parse(cs[0].sportsStartTimestamp ?? '')
          const startTime = Number.isFinite(start) ? start : closeTime
          return {
            sessionId: group[0].sessionId,
            label: sessionLabel(cs),
            startTime,
            closeTime,
            status: sessionStatus(startTime, closeTime, cs, now),
            markets: cs.map((c) => marketRef(c, answersByContract[c.id] ?? [])),
          }
        }
      )
      const ordered = sortBy(sessions, (s) => s.startTime)
      const statuses = ordered.map((s) => s.status)
      const first = markets[0].c.question
      const i = first.lastIndexOf(': ')
      return {
        id: `bdl-f1:${markets[0].eventId}`,
        sport: 'f1',
        name: i > 0 ? first.slice(0, i) : 'Formula 1',
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

/** How soon a weekend's next session has to be for /sports to feature it. */
export const FEATURED_RACE_WITHIN_MS = 4 * 24 * 60 * 60 * 1000

/**
 * The weekends /sports puts above its game feed: one that's on, or whose
 * next session is within FEATURED_RACE_WITHIN_MS. The F1 page shows them all.
 */
export function featuredRaceWeekends(
  weekends: RaceWeekend[],
  now: number
): RaceWeekend[] {
  return weekends.filter((w) => {
    if (w.status === 'live') return true
    const next = w.sessions.find((s) => s.status === 'upcoming')
    return !!next && next.startTime - now <= FEATURED_RACE_WITHIN_MS
  })
}
