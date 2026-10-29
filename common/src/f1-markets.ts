import { sortBy, sum, uniqBy } from 'lodash'
import { Answer } from './answer'
import { MAX_CPMM_PROB, MIN_CPMM_PROB } from './contract'
import { fitProbs } from './odds-markets'
import { SPORT_LEAGUE_LABEL } from './sports-calendar'
import { DAY_MS, HOUR_MS } from './util/time'

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

/**
 * Hours after a market closes before the resolver pays it out, so the
 * stewards' decisions of the evening (penalties, a disqualification) are in
 * the classification it reads. Later changes don't reopen a market.
 */
export const F1_RESOLVE_DELAY_HOURS = 2

/**
 * How far ahead sessions get markets, and how far the F1 page looks: five
 * weeks, so the next few races (and the first one after a summer break)
 * are already open.
 */
export const F1_DAYS_AHEAD = 35

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
  return pointsPrior(
    field.map((d) => d.id),
    new Map(standings.map((s) => [s.driver.id, s.points]))
  )
}

/**
 * f1WinnerPrior for any entrants by id: a driver or a team. Percents in
 * `ids` order, then the stand-in.
 */
function pointsPrior(ids: number[], pointsById: Map<number, number>) {
  const raw = ids.map((id) => {
    const points = pointsById.get(id)
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

const MANIFOLD_SPORTS_LINK =
  '[@ManifoldSports](https://manifold.markets/ManifoldSports)'

const SESSION_WORD: Record<F1SessionKind, string> = {
  race: 'race',
  sprint: 'sprint',
  qualifying: 'qualifying',
}

/**
 * Title sponsors the provider puts in front of a Grand Prix's name ("MSC
 * Cruises São Paulo Grand Prix", 2026). A sponsor missing from this list
 * leaves the name as it is, so check new seasons' names in a dry run.
 */
const F1_TITLE_SPONSORS = [
  'Aramco',
  'AWS',
  'Crypto.com',
  'Etihad Airways',
  'Gulf Air',
  'Heineken',
  'Lenovo',
  'Moët & Chandon',
  'MSC Cruises',
  'Pirelli',
  'Qatar Airways',
  'Singapore Airlines',
  'STC',
  'Tag Heuer',
]

/** A Grand Prix's name without its title sponsor: "São Paulo Grand Prix". */
export function f1EventTitle(name: string): string {
  const trimmed = name.trim()
  for (const sponsor of F1_TITLE_SPONSORS) {
    if (!trimmed.toLowerCase().startsWith(`${sponsor.toLowerCase()} `)) continue
    const rest = trimmed.slice(sponsor.length).trim()
    // Only when a Grand Prix is left: "Qatar Airways Qatar Grand Prix".
    if (/grand prix/i.test(rest)) return rest
  }
  return trimmed
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

  const title = `${event.season} ${f1EventTitle(event.name)}`
  const footer = [
    `Resolves N/A if the session is cancelled.`,
    ``,
    `Created and resolved automatically by ${MANIFOLD_SPORTS_LINK} from the data feed's classification ${F1_RESOLVE_DELAY_HOURS} hours after the market closes, so the stewards' decisions by then count. Later changes don't reopen the market.`,
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
 * A market's answers by the provider id they stand for, and its stand-in,
 * or null unless the answers are exactly the stored field: one per entrant
 * id by index. A deleted or renumbered answer would otherwise send a listed
 * entrant's win to the stand-in. Each answer stands for one entrant, or is
 * the one stand-in (only where `standInAllowed`).
 */
function answersByEntrant(
  answers: Pick<Answer, 'id' | 'index'>[],
  entrantIds: (number | null)[],
  standInAllowed: boolean
): {
  byId: Map<number, Pick<Answer, 'id'>>
  standIn: Pick<Answer, 'id'> | undefined
} | null {
  if (answers.length !== entrantIds.length) return null
  const byId = new Map<number, Pick<Answer, 'id'>>()
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
    const entrantId = entrantIds[answer.index]
    if (entrantId === null) {
      if (standIn || !standInAllowed) return null
      standIn = answer
    } else {
      if (byId.has(entrantId)) return null
      byId.set(entrantId, answer)
    }
  }
  return { byId, standIn }
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
  const field = answersByEntrant(answers, entrantIds, marketType === 'winner')
  if (!field) return null
  const { byId: byDriverId, standIn } = field

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

// ─── Sessions that move ───────────────────────────────────────────────────────
//
// The provider keeps a session's id when its time changes and marks a
// cancelled session (every session of a cancelled weekend, too) 'canceled'.
// A weekend moved elsewhere is a new event with new sessions: the old ones
// are cancelled and the new ones get markets of their own.

/** What a session market's start and close should become, if anything. */
export type F1SessionSync =
  | { kind: 'keep' }
  /** Stop trading now. */
  | { kind: 'close'; closeTime: number }
  /** Follow the session to its new start, earlier or later. */
  | { kind: 'move'; start: string; closeTime: number }

/**
 * How a session market follows its session on the provider's calendar. A
 * cancelled or postponed session stops trading now; a cancelled one then
 * resolves N/A, and a postponed one waits for its new date. A scheduled
 * session whose start has changed takes the market's start and close with
 * it, and reopens a market that closed early or on the old time, since the
 * session hasn't run. A session that should have started already never
 * gets more time: its market can only close sooner, at its new close or now.
 */
export function f1SessionSync(
  session: Pick<F1Session, 'type' | 'name' | 'date' | 'status_state'>,
  market: { closeTime: number; sportsStartTimestamp: string },
  now: number
): F1SessionSync {
  const kind = f1SessionKind(session)
  if (!kind) return { kind: 'keep' }
  const open = market.closeTime > now
  if (
    session.status_state === 'canceled' ||
    session.status_state === 'postponed'
  )
    return open ? { kind: 'close', closeTime: now } : { kind: 'keep' }
  if (session.status_state !== 'scheduled') return { kind: 'keep' }
  const start = Date.parse(session.date)
  if (!Number.isFinite(start)) return { kind: 'keep' }
  const closeTime = start + F1_CLOSE_BUFFER_HOURS[kind] * HOUR_MS
  if (start <= now)
    return open && closeTime < market.closeTime
      ? { kind: 'close', closeTime: Math.max(closeTime, now) }
      : { kind: 'keep' }
  if (
    start === Date.parse(market.sportsStartTimestamp) &&
    closeTime === market.closeTime
  )
    return { kind: 'keep' }
  return { kind: 'move', start: new Date(start).toISOString(), closeTime }
}

// ─── Season titles ────────────────────────────────────────────────────────────
//
// A season gets two title markets, the drivers' and the constructors'
// championship. They open before its first race, close when the market on
// its final race does, and resolve from the provider's final standings.
// `sportsEventId` is `bdl-f1-title:<season>:<drivers|constructors>`; the
// session resolver only reads `bdl-f1:` ids.

export type F1TitleKind = 'drivers' | 'constructors'

export const F1_TITLE_KINDS: readonly F1TitleKind[] = [
  'drivers',
  'constructors',
]

/**
 * Hours after the season's final race market closes before a title pays
 * out: the FIA's 96 hours to give notice of an appeal, so the standings it
 * reads have the final weekend's decisions in them. Later changes don't
 * reopen the market.
 */
export const F1_TITLE_RESOLVE_DELAY_HOURS = 96

/** Catches a team that wasn't in the field when the market opened. */
export const OTHER_TEAM_ANSWER = 'Another team'

/** A grid is 10 to 12 teams; a longer list isn't an entry list. */
export const MAX_F1_TEAMS = 15

const F1_TITLE_PREFIX = 'bdl-f1-title:'

export const f1TitleEventId = (season: number, kind: F1TitleKind) =>
  `${F1_TITLE_PREFIX}${season}:${kind}`

export function parseF1TitleEventId(
  id: string | null | undefined
): { season: number; kind: F1TitleKind } | null {
  if (!id || !id.startsWith(F1_TITLE_PREFIX)) return null
  const [season, kind, ...rest] = id.slice(F1_TITLE_PREFIX.length).split(':')
  if (rest.length > 0 || !/^\d{4}$/.test(season)) return null
  if (kind !== 'drivers' && kind !== 'constructors') return null
  return { season: Number(season), kind }
}

/** A team's place in the constructors' standings. */
export interface F1TeamStanding {
  id: number
  season: number
  team: F1Team
  position: number
  points: number
}

/** A title contender, a driver or a team, by the provider's id. */
export interface F1TitleEntrant {
  id: number
  name: string
  shortName: string
  color: string | null | undefined
}

export const f1DriverEntrant = (d: F1Driver): F1TitleEntrant => ({
  id: d.id,
  name: d.display_name,
  shortName: d.short_name,
  color: d.team?.color,
})

export const f1TeamEntrant = (t: F1Team): F1TitleEntrant => {
  const name = t.display_name || t.name
  return { id: t.id, name, shortName: name, color: t.color }
}

/**
 * A season's dates from the provider's calendar, cancelled weekends left
 * out: when its first weekend starts (FP1) and when its final race does.
 * Null when no weekend is left, or one has a date that doesn't parse, since
 * then the final race could be the one missing.
 */
export function f1SeasonDates(
  events: Pick<F1Event, 'start_date' | 'end_date' | 'status_state'>[]
): { firstStart: number; lastRaceStart: number } | null {
  const on = events.filter((e) => e.status_state !== 'canceled')
  const starts = on.map((e) => Date.parse(e.start_date))
  const races = on.map((e) => Date.parse(e.end_date))
  if (on.length === 0 || [...starts, ...races].some((t) => !Number.isFinite(t)))
    return null
  return { firstStart: Math.min(...starts), lastRaceStart: Math.max(...races) }
}

/** A title market's close: when the market on the final race closes. */
export const f1TitleCloseTime = (lastRaceStart: number) =>
  lastRaceStart + F1_CLOSE_BUFFER_HOURS.race * HOUR_MS

/**
 * How long before the end of the last date our calendar gives a season the
 * provider's final race may start and still be taken for the finale. That
 * date is the finale's race day, so this only allows for time zones: a
 * calendar missing the finale ends a week or more earlier.
 */
export const F1_SEASON_END_TOLERANCE_DAYS = 2

/**
 * Whether the provider's calendar reaches the season's end by our calendar
 * (common/sports-calendar.ts), a second source for the finale's date.
 * "Every listed weekend is final" doesn't show the provider listed every
 * weekend: one missing the last rounds would otherwise have a title close
 * and pay out on the last race it has. A finale earlier than ours fails,
 * and waits for a fuller calendar or a person; a later one passes. Both
 * sources would have to lose the finale for a title to pay early.
 */
export const f1CalendarReachesEnd = (
  lastRaceStart: number,
  ourSeasonEnd: number
) => lastRaceStart >= ourSeasonEnd - F1_SEASON_END_TOLERANCE_DAYS * DAY_MS

/**
 * Whether the provider's calendar lists at least the season's announced
 * number of rounds (from our calendar), cancelled weekends included. Its
 * sessions can only vouch for the standings (f1SeasonPointsAwarded) if no
 * weekend is missing: a dropped weekend takes its race out of the total,
 * and standings missing a race could then match it. A replacement round
 * makes the list longer, never shorter.
 */
export function f1CalendarListsEveryRound(
  events: Pick<F1Event, 'id'>[],
  rounds: number | undefined
): boolean {
  if (rounds === undefined || !Number.isSafeInteger(rounds) || rounds < 1)
    return false
  return new Set(events.map((e) => e.id)).size >= rounds
}

/**
 * Points between them in a fully classified race (25-18-15-12-10-8-6-4-2-1)
 * and sprint (8-7-6-5-4-3-2-1), with no fastest-lap point since 2025.
 */
export const F1_RACE_POINTS = 101
export const F1_SPRINT_POINTS = 36

/**
 * The points a season's races and sprints award between them, from the
 * provider's calendar and sessions. The final standings must add up to
 * exactly this. That checks they're consistent with the sessions, not that
 * every session is in them or scored to the right driver: standings that
 * missed the finale are short by its points, but a rescored one adds up
 * the same (F1_TITLE_SAFE_MARGIN covers that). Checked against
 * the 2025 season (24 races and 6 sprints, 2,640 points) and 2026 so far,
 * drivers and teams alike. A race paying half points, a points penalty, or
 * fewer than ten classified also miss it, and those go to a person.
 *
 * Null when the sessions can't vouch for the total: a weekend held (not
 * cancelled) without exactly one race, or with a race that isn't final; a
 * sprint not yet final or cancelled; or a session from another weekend. A
 * finale the feed leaves out or hasn't finished would otherwise drop out of
 * the total and let pre-finale standings match it.
 */
export function f1SeasonPointsAwarded(
  events: Pick<F1Event, 'id' | 'status_state'>[],
  sessions: (Pick<F1Session, 'type' | 'name' | 'status_state'> & {
    event: Pick<F1Event, 'id'>
  })[]
): { races: number; sprints: number; points: number } | null {
  const held = new Set(
    events.filter((e) => e.status_state !== 'canceled').map((e) => e.id)
  )
  if (sessions.some((s) => !held.has(s.event?.id))) return null
  const races = sessions.filter((s) => f1SessionKind(s) === 'race')
  for (const id of held) {
    const own = races.filter((s) => s.event.id === id)
    if (own.length !== 1 || own[0].status_state !== 'final') return null
  }
  const sprints = sessions.filter((s) => f1SessionKind(s) === 'sprint')
  if (
    sprints.some(
      (s) => s.status_state !== 'final' && s.status_state !== 'canceled'
    )
  )
    return null
  const finalSprints = sprints.filter((s) => s.status_state === 'final').length
  return {
    races: held.size,
    sprints: finalSprints,
    points: held.size * F1_RACE_POINTS + finalSprints * F1_SPRINT_POINTS,
  }
}

/**
 * Whether the provider's calendar has the season over: every weekend final
 * or cancelled, and at least one final.
 */
export function f1SeasonComplete(
  events: Pick<F1Event, 'status_state'>[]
): boolean {
  return (
    events.some((e) => e.status_state === 'final') &&
    events.every(
      (e) => e.status_state === 'final' || e.status_state === 'canceled'
    )
  )
}

export interface F1TitleMarketParams {
  outcomeType: 'MULTIPLE_CHOICE'
  question: string
  /** Markdown */
  description: string
  /** Favourites first, then the stand-in answer. */
  answers: string[]
  /** Opening probability of each answer as a percent. */
  answerProbs: number[]
  answerShortTexts: string[]
  /** Team colours; undefined when any entrant has none. */
  answerColors?: string[]
  shouldAnswersSumToOne: true
  closeTime: number
  sportsEventId: string
  /** The season's first weekend (FP1). */
  sportsStartTimestamp: string
  sportsLeague: string
  sportsMarketType: 'title'
  /** The provider's id behind each answer, null for the stand-in. */
  sportsEntrantIds: (number | null)[]
}

const TITLE_WORDS: Record<
  F1TitleKind,
  { title: string; one: string; other: string }
> = {
  drivers: { title: "Drivers'", one: 'driver', other: OTHER_DRIVER_ANSWER },
  constructors: {
    title: "Constructors'",
    one: 'team',
    other: OTHER_TEAM_ANSWER,
  },
}

/**
 * A season's drivers' or constructors' title market, or null when `field`
 * isn't an entry list (fewer than two, or more than a grid holds) or the
 * dates don't make sense. Entrants open at the points prior from
 * `priorPoints`, favourites first, with the stand-in last; one listed twice
 * counts once. Before a season starts, `priorPoints` is the last season's.
 */
export function buildF1TitleMarketParams(
  season: number,
  kind: F1TitleKind,
  field: F1TitleEntrant[],
  priorPoints: { id: number; points: number }[],
  dates: { firstStart: number; closeTime: number }
): F1TitleMarketParams | null {
  const roster = uniqBy(field, (e) => e.id)
  const max = kind === 'drivers' ? MAX_F1_FIELD : MAX_F1_TEAMS
  if (roster.length < 2 || roster.length > max) return null
  const { firstStart, closeTime } = dates
  if (
    !Number.isFinite(firstStart) ||
    !Number.isFinite(closeTime) ||
    closeTime <= firstStart
  )
    return null

  const percents = pointsPrior(
    roster.map((e) => e.id),
    new Map(priorPoints.map((p) => [p.id, p.points]))
  )
  const ranked = sortBy(
    roster.map((entrant, i) => ({ entrant, percent: percents[i] })),
    (e) => -e.percent
  )
  const colors = ranked.map((e) => hexColor(e.entrant.color))
  const words = TITLE_WORDS[kind]
  const title = `${season} F1 ${words.title} Championship`
  return {
    outcomeType: 'MULTIPLE_CHOICE',
    question: `Who will win the ${title}?`,
    description: [
      `**${title}**`,
      ``,
      `Resolves to the ${
        words.one
      } first in the final ${season} ${words.title.toLowerCase()} standings.`,
      `"${words.other}" covers a ${words.one} who wasn't listed when the market opened.`,
      ``,
      `Closes when the market on the season's final race does. Created and resolved automatically by ${MANIFOLD_SPORTS_LINK} from the data feed's final standings ${F1_TITLE_RESOLVE_DELAY_HOURS} hours after that, once the FIA's time to give notice of an appeal has run out. If the ${words.one} won by ${F1_TITLE_SAFE_MARGIN[kind]} points or fewer, as much as one weekend's results, scored or rescored, could change, a person checks the standings before it pays out. Later changes don't reopen the market.`,
      ``,
      `[See all markets on Manifold Sports](/sports?sport=f1)`,
    ].join('\n'),
    answers: [...ranked.map((e) => e.entrant.name), words.other],
    answerProbs: [...ranked.map((e) => e.percent), percents[roster.length]],
    answerShortTexts: [...ranked.map((e) => e.entrant.shortName), 'OTHER'],
    answerColors: colors.every((c): c is string => !!c)
      ? [...colors, '#9CA3AF']
      : undefined,
    shouldAnswersSumToOne: true,
    closeTime,
    sportsEventId: f1TitleEventId(season, kind),
    sportsStartTimestamp: new Date(firstStart).toISOString(),
    sportsLeague: SPORT_LEAGUE_LABEL.f1,
    sportsMarketType: 'title',
    sportsEntrantIds: [...ranked.map((e) => e.entrant.id), null],
  }
}

/** A row of either standings, by the provider's id of the driver or team. */
export interface F1StandingRow {
  id: number
  season: number
  position: number
  points: number
}

export const f1DriverStandingRow = (s: F1DriverStanding): F1StandingRow => ({
  id: s.driver?.id,
  season: s.season,
  position: s.position,
  points: s.points,
})

export const f1TeamStandingRow = (s: F1TeamStanding): F1StandingRow => ({
  id: s.team?.id,
  season: s.season,
  position: s.position,
  points: s.points,
})

/**
 * The most one race weekend awards one contender over another: a race and
 * sprint win against nothing for a driver (25 + 8), a race and sprint
 * one-two for a team (25 + 18 + 8 + 7). No fastest-lap point since 2025.
 */
const F1_WEEKEND_GAIN: Record<F1TitleKind, number> = {
  drivers: 33,
  constructors: 58,
}

/**
 * How far clear of the next a title's leader must be for it to pay out by
 * itself: twice F1_WEEKEND_GAIN, the most one weekend's results can change
 * the gap, whether the standings miss the weekend or still score it as
 * before a rescoring (a disqualification after the race takes the
 * leader's points away and promotes the rival). Standings out of date by
 * one weekend then name the champion either way.
 */
export const F1_TITLE_SAFE_MARGIN: Record<F1TitleKind, number> = {
  drivers: 2 * F1_WEEKEND_GAIN.drivers,
  constructors: 2 * F1_WEEKEND_GAIN.constructors,
}

/** How far the standings' points leader is clear of the next best. */
export function f1TitleMargin(standings: Pick<F1StandingRow, 'points'>[]) {
  const [first, second] = sortBy(
    standings.map((s) => s.points),
    (p) => -p
  )
  return (first ?? 0) - (second ?? 0)
}

/**
 * The answer a title market resolves to from the season's final standings,
 * or null when they can't say for certain: a row from another season, an
 * entrant listed twice, two on one position, no leader, a points total
 * that isn't a number, or a leader no more than F1_TITLE_SAFE_MARGIN clear
 * of the next. Standings out of date by a weekend could otherwise name the
 * wrong champion when that weekend decided the title; with a bigger lead,
 * it couldn't have, so the leader is the champion either way. A title that
 * close, or a tie settled on countback, is a person's call. Also null
 * when the market's entrant ids don't line up with its answers, or the
 * champion isn't one of them: a person decides between the stand-in and a
 * re-identified entrant. Whether the season is over, and the standings
 * complete, are the caller's checks (f1SeasonComplete,
 * f1CalendarReachesEnd, f1CalendarListsEveryRound, f1SeasonPointsAwarded).
 * A null is for a human, never a guess.
 */
export function f1TitleResolution(
  season: number,
  kind: F1TitleKind,
  standings: F1StandingRow[],
  answers: Pick<Answer, 'id' | 'index'>[],
  entrantIds: (number | null)[]
): { outcome: string; resolutions: Record<string, number> } | null {
  if (standings.length === 0) return null
  if (
    standings.some(
      (s) =>
        s.season !== season ||
        !Number.isSafeInteger(s.id) ||
        !Number.isSafeInteger(s.position) ||
        s.position < 1 ||
        !Number.isFinite(s.points)
    )
  )
    return null
  const ids = standings.map((s) => s.id)
  const positions = standings.map((s) => s.position)
  if (
    new Set(ids).size !== ids.length ||
    new Set(positions).size !== positions.length
  )
    return null
  const leader = standings.find((s) => s.position === 1)
  if (!leader) return null
  const next = Math.max(
    0,
    ...standings.filter((s) => s !== leader).map((s) => s.points)
  )
  if (!(leader.points - next > F1_TITLE_SAFE_MARGIN[kind])) return null

  const field = answersByEntrant(answers, entrantIds, true)
  if (!field) return null
  // A champion the field doesn't list never pays the stand-in by itself:
  // the provider gives a team a new id when it's rebranded (Sauber #814
  // became Audi #825 in 2026), so an unknown id may be a listed entrant.
  const answer = field.byId.get(leader.id)
  if (!answer) return null
  return { outcome: answer.id, resolutions: { [answer.id]: 100 } }
}
