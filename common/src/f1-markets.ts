import { sortBy, sum } from 'lodash'
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
  /** Three letters: VER, NOR. */
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
  /** YYYY-MM-DD */
  start_date: string
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
  /** "Race", "Qualifying", "Sprint", "Sprint Qualifying", "Practice 1"… */
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
 * rather than exact strings: the docs show `type` "Race" with `name` "Race"
 * and "Qual", and don't show a sprint, so check the real strings on a trial
 * key before trusting a new season.
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
 * kept inside the range an answer can trade at. A crude prior, but at a
 * Ṁ1,000 ante being wrong is cheap, and the futures odds that could replace
 * it sit on the provider's higher tier. Percents in `field` order, then the
 * stand-in answer.
 */
export function f1WinnerPrior(
  field: Pick<F1Driver, 'id'>[],
  standings: Pick<F1DriverStanding, 'driver' | 'points'>[]
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
 * A driver's chance of a podium from their chance of winning, as the chance
 * of taking at least one of three draws: 1 - (1 - p)^3. Over a field these
 * add up to a little under three, the number of podium places. Percents in
 * the same order, clamped to the tradeable range; independent, so they
 * don't sum to one.
 */
export function f1PodiumPrior(winnerPercents: number[]): number[] {
  return winnerPercents.map((percent) => {
    const p = Math.min(1, Math.max(0, percent / 100))
    const podium = 1 - (1 - p) ** 3
    return Math.min(MAX_CPMM_PROB, Math.max(MIN_CPMM_PROB, podium)) * 100
  })
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
 * kind doesn't get one. Drivers open at the standings prior, favourites
 * first. `field` is the season's entry list: every driver in the standings,
 * in any order.
 */
export function buildF1MarketParams(
  event: Pick<F1Event, 'id' | 'name' | 'season'>,
  session: Pick<F1Session, 'id' | 'type' | 'name' | 'date'>,
  field: F1Driver[],
  standings: Pick<F1DriverStanding, 'driver' | 'points'>[],
  marketType: F1MarketType
): F1MarketParams | null {
  const kind = f1SessionKind(session)
  if (!kind || !F1_MARKETS_BY_SESSION[kind].includes(marketType)) return null
  if (field.length === 0) return null

  const winnerPercents = f1WinnerPrior(field, standings)
  const drivers = sortBy(
    field.map((driver, i) => ({ driver, percent: winnerPercents[i] })),
    (d) => -d.percent
  )
  const otherPercent = winnerPercents[field.length]

  const answers = drivers.map((d) => d.driver.display_name)
  const answerShortTexts = drivers.map((d) => d.driver.short_name)
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
    }
  }

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
    answerProbs: f1PodiumPrior(drivers.map((d) => d.percent)),
    answerColors,
    shouldAnswersSumToOne: false,
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

/** Case, accents and spacing don't tell drivers apart. */
const normaliseName = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

const answerForDriver = (
  answers: Pick<Answer, 'id' | 'text'>[],
  driver: Pick<F1Driver, 'display_name' | 'first_name' | 'last_name'>
) => {
  const names = [
    driver.display_name,
    `${driver.first_name} ${driver.last_name}`,
  ].map(normaliseName)
  return answers.find((a) => names.includes(normaliseName(a.text)))
}

/**
 * How a session's market resolves from the provider's classification, or
 * null when it can't yet: the session isn't final, the classification is
 * incomplete, or the winner matches no answer and there's no stand-in. A
 * null is for a human to look at, never a guess.
 */
export function f1SessionResolution(
  session: Pick<F1Session, 'status_state'>,
  results: Pick<F1SessionResult, 'driver' | 'position' | 'is_winner'>[],
  answers: Pick<Answer, 'id' | 'text'>[],
  marketType: F1MarketType
): F1Resolution | null {
  if (session.status_state !== 'final') return null
  const classified = sortBy(
    results.filter(
      (r): r is typeof r & { position: number } =>
        typeof r.position === 'number' &&
        Number.isSafeInteger(r.position) &&
        r.position >= 1
    ),
    (r) => r.position
  )

  if (marketType === 'winner') {
    const winner =
      results.find((r) => r.is_winner) ??
      classified.find((r) => r.position === 1)
    if (!winner) return null
    const answer =
      answerForDriver(answers, winner.driver) ??
      answers.find(
        (a) => normaliseName(a.text) === normaliseName(OTHER_DRIVER_ANSWER)
      )
    if (!answer) return null
    return {
      kind: 'sum-to-one',
      outcome: answer.id,
      resolutions: { [answer.id]: 100 },
    }
  }

  const podium = classified.filter((r) => r.position <= 3)
  if (podium.length !== 3) return null
  const onPodium = new Set(
    podium.map((r) => answerForDriver(answers, r.driver)?.id).filter(Boolean)
  )
  return {
    kind: 'independent',
    resolutions: Object.fromEntries(
      answers.map((a) => [a.id, onPodium.has(a.id) ? 'YES' : 'NO'])
    ),
  }
}
