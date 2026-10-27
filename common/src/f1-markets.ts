import { sortBy, sum, uniqBy } from 'lodash'
import { Answer } from './answer'
import { MAX_CPMM_PROB, MIN_CPMM_PROB } from './contract'
import { fitProbs } from './odds-markets'
import { SPORT_LEAGUE_LABEL } from './sports-calendar'
import { HOUR_MS } from './util/time'

// ─── Formula 1 via BALLDONTLIE: pure helpers ─────────────────────────────────
//
// A Grand Prix weekend is one event with several sessions. The Odds API has
// no motorsport, so F1 markets come from BALLDONTLIE's F1 API, which lists
// the sessions ahead of time and classifies each one about ten minutes after
// it ends. A session gets a market per market type, with the drivers as the
// answers. Nothing in this file touches the network or the database: the
// backend fetches, inserts and resolves (see backend/shared/balldontlie-f1-
// client.ts). Field names are the provider's, so a response can be passed
// straight through.
//
// Docs: https://f1.balldontlie.io/

export interface F1Team {
  id: number
  name: string
  display_name: string
  /** Hex, with or without the '#'. */
  color: string | null
}

export interface F1Driver {
  id: number
  first_name: string
  last_name: string
  display_name: string
  /** Initial and surname: "K. Antonelli". */
  short_name: string
  country_code: string | null
  racing_number: number | null
  team?: F1Team | null
}

/** The provider's lifecycle states; prefer these over `status`. */
export type F1StatusState =
  | 'scheduled'
  | 'in_progress'
  | 'final'
  | 'postponed'
  | 'canceled'
  | 'delayed'
  | 'suspended'
  | 'abandoned'
  | 'unknown'

/** A race weekend. */
export interface F1Event {
  id: number
  /** "Singapore Grand Prix" */
  name: string
  short_name: string
  season: number
  /** ISO 8601: the first session's start (FP1). */
  start_date: string
  /** ISO 8601: the race's start, not the weekend's end. */
  end_date: string
  status_state: F1StatusState
  circuit?: {
    id: number
    name: string
    short_name: string
    country_code: string | null
    country_name: string | null
  } | null
  country_code?: string | null
  country_name?: string | null
}

export interface F1Session {
  id: number
  event: Pick<F1Event, 'id' | 'name' | 'short_name' | 'season'>
  /** "Race", "Qualifying", "Sprint", "Sprint Qualifying", "FP1"… */
  type: string
  name: string
  /** ISO 8601 start */
  date: string
  status_state: F1StatusState
}

export interface F1SessionResult {
  id: number
  session: Pick<F1Session, 'id'>
  driver: F1Driver
  /** Classified position; null when unclassified. */
  position: number | null
  is_winner: boolean
  laps_completed: number | null
  retired: boolean
}

/** The part of a standings row the prior reads. */
export type F1Points = { driver: Pick<F1Driver, 'id'>; points: number }

export interface F1DriverStanding {
  id: number
  season: number
  driver: F1Driver
  position: number
  points: number
}

// ─── Sessions and the markets they get ───────────────────────────────────────

export type F1SessionKind = 'race' | 'sprint' | 'qualifying'

/**
 * Which session this is, or null for the ones that get no market (practice,
 * and sprint qualifying, which only sets the sprint grid). Matched on words
 * rather than exact strings. The 2026 season's real `type`/`name` pairs
 * (checked 27 Oct 2026) are Race/Race, Qualifying/Qual, Sprint/SR, Sprint
 * Qualifying/SS and FP1/FP1 to FP3/FP3; practice falls through to null.
 * Check them again before trusting a new season.
 */
export function f1SessionKind(
  session: Pick<F1Session, 'type' | 'name'>
): F1SessionKind | null {
  const text = `${session.type} ${session.name}`.toLowerCase()
  if (text.includes('practice')) return null
  if (text.includes('sprint')) {
    return text.includes('qual') || text.includes('shootout') ? null : 'sprint'
  }
  if (text.includes('qual')) return 'qualifying'
  if (text.includes('race')) return 'race'
  return null
}

/**
 * 'winner': the driver classified first in the session; for qualifying that
 *   is pole position. Sums to one, with a stand-in answer.
 * 'podium': each driver resolves YES if classified in the top three.
 *   Independent answers, no stand-in.
 */
export type F1MarketType = 'winner' | 'podium'

export const F1_MARKETS_BY_SESSION: Record<F1SessionKind, F1MarketType[]> = {
  race: ['winner', 'podium'],
  sprint: ['winner'],
  qualifying: ['winner'],
}

/**
 * Hours after a session starts before its markets close: the race's two-hour
 * limit plus a suspension, an hour-long qualifying, a half-hour sprint.
 */
export const F1_CLOSE_BUFFER_HOURS: Record<F1SessionKind, number> = {
  race: 3,
  sprint: 1,
  qualifying: 1.5,
}

/** Catches a stand-in who wasn't in the field when the market opened. */
export const OTHER_DRIVER_ANSWER = 'Another driver'

/**
 * The most entrants a market takes. A grid is 20 to 22 cars, and every
 * answer has to open at 1% or more, so a longer roster isn't a current
 * entry list (the provider's /drivers endpoint lists everyone on file since
 * 2018) and nothing is created from it.
 */
export const MAX_F1_FIELD = 30

// ─── Event ids ────────────────────────────────────────────────────────────────
//
// `sportsEventId` is `bdl-f1:<event id>:<session id>`: the prefix tells the
// resolver which provider to poll (the Odds API pipeline only looks at
// `odds:` ids), and the event id groups a weekend's sessions.

const F1_EVENT_PREFIX = 'bdl-f1:'

export const f1EventId = (eventId: number, sessionId: number) =>
  `${F1_EVENT_PREFIX}${eventId}:${sessionId}`

export function parseF1EventId(
  id: string | null | undefined
): { eventId: number; sessionId: number } | null {
  if (!id || !id.startsWith(F1_EVENT_PREFIX)) return null
  const [eventId, sessionId, ...rest] = id
    .slice(F1_EVENT_PREFIX.length)
    .split(':')
  if (rest.length > 0) return null
  const e = Number(eventId)
  const s = Number(sessionId)
  if (!Number.isSafeInteger(e) || !Number.isSafeInteger(s) || e <= 0 || s <= 0)
    return null
  return { eventId: e, sessionId: s }
}

// ─── Opening prices ───────────────────────────────────────────────────────────

/** Points added to every driver's total so the first race opens near level. */
const PRIOR_SMOOTHING_POINTS = 10
/** Points share is flatter than win probability; squaring sharpens it. */
const PRIOR_EXPONENT = 2
/** The stand-in answer's share of the field before fitting. */
const OTHER_DRIVER_SHARE = 0.01

/**
 * Opening probabilities for a winner market from the season's standings:
 * each driver's smoothed, sharpened share of points, then the stand-in, all
 * kept inside the range an answer can trade at. A crude prior: the ante is
 * Ṁ100 an answer at the Ṁ1,000 tier (about Ṁ2,300 for a grid), and a wrong
 * opening price gives the first traders a slice of that, while the futures
 * odds that could replace it sit on the provider's higher tier. Percents in
 * `field` order, then the stand-in answer.
 */
export function f1WinnerPrior(
  field: Pick<F1Driver, 'id'>[],
  standings: F1Points[]
): number[] {
  const pointsById = new Map(standings.map((s) => [s.driver.id, s.points]))
  const raw = field.map((d) => {
    const points = pointsById.get(d.id)
    const safe = Number.isFinite(points) ? Math.max(0, points!) : 0
    return (safe + PRIOR_SMOOTHING_POINTS) ** PRIOR_EXPONENT
  })
  const other = sum(raw) * OTHER_DRIVER_SHARE
  return fitProbs([...raw, other], MIN_CPMM_PROB, MAX_CPMM_PROB).map(
    (p) => p * 100
  )
}

/**
 * Each entrant's chance of a podium from the field's chances of winning,
 * under a Plackett–Luce ranking: first place is drawn by those chances,
 * then second from the rest in proportion to theirs, then third. Over the
 * field the chances add up to exactly three places, and nobody takes two.
 * Pass every entrant, the stand-in included, so its share is counted even
 * though the podium market has no answer for it. Percents in the same
 * order, clamped to the tradeable range; the answers are independent, so
 * they don't sum to one.
 */
export function f1PodiumPrior(winnerPercents: number[]): number[] {
  const n = winnerPercents.length
  const total = sum(winnerPercents.filter((x) => Number.isFinite(x) && x > 0))
  const p = winnerPercents.map((x) =>
    Number.isFinite(x) && x > 0 && total > 0 ? x / total : 0
  )
  const podium = p.map((pi, i) => {
    if (pi <= 0) return 0
    let second = 0
    let third = 0
    for (let j = 0; j < n; j++) {
      if (j === i || p[j] <= 0) continue
      const afterJ = 1 - p[j]
      if (afterJ <= 0) continue
      second += (p[j] * pi) / afterJ
      for (let k = 0; k < n; k++) {
        if (k === i || k === j || p[k] <= 0) continue
        const afterJK = afterJ - p[k]
        if (afterJK <= 0) continue
        third += (p[j] * (p[k] / afterJ) * pi) / afterJK
      }
    }
    return pi + second + third
  })
  return podium.map(
    (x) => Math.min(MAX_CPMM_PROB, Math.max(MIN_CPMM_PROB, x)) * 100
  )
}

// ─── The market a session becomes ─────────────────────────────────────────────

export interface F1MarketParams {
  outcomeType: 'MULTIPLE_CHOICE'
  question: string
  /** Markdown */
  description: string
  /** Favourites first; a winner market ends with the stand-in answer. */
  answers: string[]
  /** Opening probability of each answer as a percent. */
  answerProbs: number[]
  answerShortTexts: string[]
  /** Team colours; undefined when any driver's team has none. */
  answerColors?: string[]
  shouldAnswersSumToOne: boolean
  closeTime: number
  sportsEventId: string
  sportsStartTimestamp: string
  sportsLeague: string
  sportsMarketType: F1MarketType
  /**
   * The provider's driver id behind each answer, in answer order, null for
   * the stand-in. Stored on the contract: the resolver matches results by
   * id, so a renamed answer or a provider's spelling still pays the right
   * driver.
   */
  sportsEntrantIds: (number | null)[]
}

const hexColor = (color: string | null | undefined): string | undefined => {
  const hex = color?.trim().replace(/^#/, '')
  return hex && /^[0-9a-f]{6}$/i.test(hex) ? `#${hex.toUpperCase()}` : undefined
}

const SESSION_WORD: Record<F1SessionKind, string> = {
  race: 'race',
  sprint: 'sprint',
  qualifying: 'qualifying',
}

/**
 * The market for one session and market type, or null when that session
 * kind doesn't get one, or `field` isn't a usable entry list (empty, or
 * longer than MAX_F1_FIELD). Drivers open at the standings prior,
 * favourites first. `field` is the season's entry list: the drivers in the
 * standings, in any order; a driver listed twice counts once.
 */
export function buildF1MarketParams(
  event: Pick<F1Event, 'id' | 'name' | 'season'>,
  session: Pick<F1Session, 'id' | 'type' | 'name' | 'date'>,
  field: F1Driver[],
  standings: F1Points[],
  marketType: F1MarketType
): F1MarketParams | null {
  const kind = f1SessionKind(session)
  if (!kind || !F1_MARKETS_BY_SESSION[kind].includes(marketType)) return null
  const roster = uniqBy(field, (d) => d.id)
  if (roster.length === 0 || roster.length > MAX_F1_FIELD) return null

  const winnerPercents = f1WinnerPrior(roster, standings)
  const drivers = sortBy(
    roster.map((driver, i) => ({ driver, percent: winnerPercents[i] })),
    (d) => -d.percent
  )
  const otherPercent = winnerPercents[roster.length]

  const answers = drivers.map((d) => d.driver.display_name)
  const answerShortTexts = drivers.map((d) => d.driver.short_name)
  const entrantIds = drivers.map((d) => d.driver.id)
  const colors = drivers.map((d) => hexColor(d.driver.team?.color))
  const answerColors = colors.every((c): c is string => !!c)
    ? colors
    : undefined

  const title = `${event.season} ${event.name}`
  const manifoldSportsLink =
    '[@ManifoldSports](https://manifold.markets/ManifoldSports)'
  const footer = [
    `Resolves N/A if the session is cancelled.`,
    ``,
    `Created and resolved automatically by ${manifoldSportsLink} from the data feed's classification once the session is final. Stewards' decisions after that don't change the resolution.`,
    ``,
    `[See all markets on Manifold Sports](/sports?sport=f1)`,
  ]

  const closeTime =
    new Date(session.date).getTime() + F1_CLOSE_BUFFER_HOURS[kind] * HOUR_MS
  const base = {
    outcomeType: 'MULTIPLE_CHOICE' as const,
    answerShortTexts,
    closeTime,
    sportsEventId: f1EventId(event.id, session.id),
    sportsStartTimestamp: session.date,
    sportsLeague: SPORT_LEAGUE_LABEL.f1,
    sportsMarketType: marketType,
  }

  if (marketType === 'winner') {
    const what =
      kind === 'qualifying' ? 'pole position' : `${SESSION_WORD[kind]} winner`
    const rule =
      kind === 'qualifying'
        ? "Resolves to the driver classified first in qualifying. Grid penalties applied afterwards don't count."
        : `Resolves to the driver classified first in the ${SESSION_WORD[kind]}.`
    return {
      ...base,
      question: `${title}: ${what}`,
      description: [
        `**${title} — ${what}**`,
        ``,
        rule,
        `"${OTHER_DRIVER_ANSWER}" covers a stand-in who wasn't in the field when the market opened.`,
        ...footer,
      ].join('\n'),
      answers: [...answers, OTHER_DRIVER_ANSWER],
      answerProbs: [...drivers.map((d) => d.percent), otherPercent],
      answerShortTexts: [...answerShortTexts, 'OTHER'],
      answerColors: answerColors && [...answerColors, '#9CA3AF'],
      shouldAnswersSumToOne: true,
      sportsEntrantIds: [...entrantIds, null],
    }
  }

  // The stand-in's share is in the ranking but gets no answer.
  const podiumPercents = f1PodiumPrior([
    ...drivers.map((d) => d.percent),
    otherPercent,
  ]).slice(0, drivers.length)
  return {
    ...base,
    question: `${title}: podium`,
    description: [
      `**${title} — podium**`,
      ``,
      `Each driver resolves YES if classified in the top three of the race, NO otherwise.`,
      ...footer,
    ].join('\n'),
    answers,
    answerProbs: podiumPercents,
    answerColors,
    shouldAnswersSumToOne: false,
    sportsEntrantIds: entrantIds,
  }
}

// ─── Resolution ───────────────────────────────────────────────────────────────

export type F1Resolution =
  | {
      kind: 'sum-to-one'
      /** The winning answer's id. */
      outcome: string
      resolutions: Record<string, number>
    }
  | {
      kind: 'independent'
      resolutions: Record<string, 'YES' | 'NO'>
    }

type ClassifiedResult = Pick<F1SessionResult, 'driver' | 'is_winner'> & {
  position: number
}

/**
 * The classification checked for what would make a payout wrong: a driver
 * listed twice, two drivers on one position, more than one winner flag, or
 * a winner flag on anyone but the driver classified first (a stale flag
 * after a disqualification or exclusion). Null means don't resolve.
 */
function checkedClassification(
  results: Pick<F1SessionResult, 'driver' | 'position' | 'is_winner'>[]
): { classified: ClassifiedResult[]; first: ClassifiedResult | null } | null {
  const ids = results.map((r) => r.driver.id)
  if (new Set(ids).size !== ids.length) return null
  const classified = sortBy(
    results.filter(
      (r): r is ClassifiedResult =>
        typeof r.position === 'number' &&
        Number.isSafeInteger(r.position) &&
        r.position >= 1
    ),
    (r) => r.position
  )
  const positions = classified.map((r) => r.position)
  if (new Set(positions).size !== positions.length) return null
  const first = classified.find((r) => r.position === 1) ?? null
  const flagged = results.filter((r) => r.is_winner)
  if (flagged.length > 1) return null
  if (flagged.length === 1 && flagged[0].driver.id !== first?.driver.id)
    return null
  return { classified, first }
}

/**
 * How a session's market resolves from the provider's classification, or
 * null when it can't: the session isn't final, the classification fails
 * checkedClassification or is incomplete, the market's entrant ids don't
 * line up with its answers, or the winner is outside the field and there's
 * no stand-in. A null is for a human to look at, never a guess.
 *
 * `entrantIds` is the contract's sportsEntrantIds: the provider's driver id
 * for each answer by answer index, null for the stand-in.
 */
export function f1SessionResolution(
  session: Pick<F1Session, 'status_state'>,
  results: Pick<F1SessionResult, 'driver' | 'position' | 'is_winner'>[],
  answers: Pick<Answer, 'id' | 'index'>[],
  entrantIds: (number | null)[],
  marketType: F1MarketType
): F1Resolution | null {
  if (session.status_state !== 'final') return null
  const checked = checkedClassification(results)
  if (!checked) return null

  // The answers must be exactly the stored field, one per entrant id by
  // index: a deleted or renumbered answer would otherwise send a listed
  // driver's win to the stand-in. Each answer stands for one driver, or is
  // the one stand-in.
  if (answers.length !== entrantIds.length) return null
  const byDriverId = new Map<number, Pick<Answer, 'id'>>()
  const seenIndex = new Set<number>()
  let standIn: Pick<Answer, 'id'> | undefined
  for (const answer of answers) {
    if (
      !Number.isSafeInteger(answer.index) ||
      answer.index < 0 ||
      answer.index >= entrantIds.length ||
      seenIndex.has(answer.index)
    )
      return null
    seenIndex.add(answer.index)
    const driverId = entrantIds[answer.index]
    if (driverId === null) {
      if (standIn || marketType !== 'winner') return null
      standIn = answer
    } else {
      if (byDriverId.has(driverId)) return null
      byDriverId.set(driverId, answer)
    }
  }

  if (marketType === 'winner') {
    const winner = checked.first
    if (!winner) return null
    // The stand-in is only for a driver outside the field; a listed driver
    // always has an answer after the checks above.
    const answer =
      byDriverId.get(winner.driver.id) ??
      (entrantIds.includes(winner.driver.id) ? undefined : standIn)
    if (!answer) return null
    return {
      kind: 'sum-to-one',
      outcome: answer.id,
      resolutions: { [answer.id]: 100 },
    }
  }

  // Positions are unique and sorted, so three of them at or below three
  // means exactly first, second and third.
  const podium = checked.classified.filter((r) => r.position <= 3)
  if (podium.length !== 3) return null
  const onPodium = new Set(
    podium.map((r) => byDriverId.get(r.driver.id)?.id).filter(Boolean)
  )
  return {
    kind: 'independent',
    resolutions: Object.fromEntries(
      answers.map((a) => [a.id, onPodium.has(a.id) ? 'YES' : 'NO'])
    ),
  }
}
