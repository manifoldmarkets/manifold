import { z } from 'zod'
import type { Answer } from '../answer'
import { type Contract, isMultiCpmm, isSportsContract } from '../contract'
import { officialBdlLeagueKey } from '../sports-league-label'
import { DAY_MS } from '../util/time'
import { LIVE_STALE_MS } from '../sports-schedule'
import { bdlHeadToHeadEventId, parseBdlEventId } from '../sports-ids'
import {
  UFC_DRAW_ANSWER,
  UFC_SEGMENTS,
  ufcWinnerDecision,
  ufcMethod,
  type UfcBout,
  type UfcCard,
} from './ufc'

const id = z.number().int().positive().safe(),
  time = z.number().finite().nonnegative().max(8.64e15)
const label = z.string().trim().min(1).max(200)
const status = z.enum([
  'scheduled',
  'in_progress',
  'final',
  'postponed',
  'canceled',
  'delayed',
  'suspended',
  'abandoned',
  'unknown',
])
const snapshot = z.object({
  observedEventId: z.string(),
  cardId: id,
  cardName: label,
  cardDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  venue: label.optional(),
  segment: z.enum(UFC_SEGMENTS).nullable(),
  segmentStart: time.nullable(),
  order: id.nullable(),
  headline: z.boolean(),
  titleFight: z.boolean(),
  status,
  observedAt: time,
  lastNonfinalAt: time.nullable(),
  firstFinalAt: time.nullable(),
  winner: z.union([id, z.literal('draw-or-no-contest')]).nullable(),
  method: label.nullable(),
  round: id.nullable(),
  roundTime: z
    .string()
    .regex(/^(?:[0-4]:[0-5]\d|5:00)$/)
    .nullable(),
  scheduledRounds: id.nullable(),
  weightClass: label.optional(),
  onlyRemaining: z.boolean(),
})
export type UfcMarketSnapshot = z.infer<typeof snapshot>
export type UfcSelection = {
  answerId: string
  fighterId: number | null
  name: string
  prob: number
}
export type UfcMarketBout = UfcMarketSnapshot & {
  id: string
  eventId: string
  fightId: number
  slug: string
  creatorUsername: string
  groupSlugs: string[]
  closeTime: number | null
  isResolved: boolean
  winnerAnswerId: string | null
  /** A public filter may hide conflicting pending bouts; it cannot extend their receipt. */
  suppressUpNext?: true
  answers: UfcSelection[]
}
export type UfcMarketCard = {
  id: number
  name: string
  date: string
  venue?: string
  bouts: UfcMarketBout[]
  partial?: true
}
export function filterUfcCards(
  cards: readonly UfcMarketCard[],
  keep: (bout: UfcMarketBout, card: UfcMarketCard) => boolean
): UfcMarketCard[] {
  return cards.flatMap((card) => {
    const pending = card.bouts.filter(
      (b) => b.status !== 'final' && b.status !== 'canceled'
    )
    const bouts = card.bouts
      .filter((b) => b.observedEventId === b.eventId && keep(b, card))
      .map((b) =>
        pending.length > 1 && b.onlyRemaining
          ? { ...b, suppressUpNext: true as const }
          : b
      )
    return !bouts.length
      ? []
      : bouts.length === card.bouts.length
      ? [{ ...card, bouts }]
      : [{ ...card, bouts, partial: true as const }]
  })
}

/** A card's advertised segment start is the earliest time a bout can start.
 * lastNonfinalAt/firstFinalAt bracket the observed transition, not the actual finish. */
export function ufcMarketObservation(
  card: UfcCard,
  bout: UfcBout,
  at: number,
  previous: UfcMarketSnapshot | null,
  onlyRemaining = false
): UfcMarketSnapshot {
  if (card.id !== bout.cardId || !Number.isSafeInteger(at) || at < 0)
    throw Error('Invalid UFC observation')
  const observedEventId = bdlHeadToHeadEventId(
    'mma',
    bout.id,
    bout.fighters[0].id,
    bout.fighters[1].id
  )
  if (bout.eventId !== observedEventId) throw Error('Invalid UFC matchup')
  if (previous && at <= previous.observedAt) return previous
  if (
    previous?.observedEventId !== observedEventId ||
    previous.cardId !== card.id
  )
    previous = null
  const decision = ufcWinnerDecision(
    {
      fightId: bout.id,
      fighterIds: [bout.fighters[0].id, bout.fighters[1].id],
      observation: null,
      observedAt: null,
    },
    bout,
    at,
    0
  )
  const state =
    decision.kind === 'attention' && bout.status !== 'final'
      ? 'unknown'
      : bout.status
  const verifiedResult = decision.kind === 'resolve' && state === 'final'
  return {
    observedEventId,
    cardId: card.id,
    cardName: card.name,
    cardDate: card.date,
    venue: card.venue,
    segment: bout.segment,
    segmentStart: (bout.segment && card.starts[bout.segment]) ?? null,
    order: bout.order,
    headline: bout.headline,
    titleFight: bout.titleFight,
    status: state,
    observedAt: at,
    lastNonfinalAt:
      bout.status === 'final' ? previous?.lastNonfinalAt ?? null : at,
    firstFinalAt:
      bout.status === 'final'
        ? previous?.status === 'final'
          ? previous.firstFinalAt ?? at
          : at
        : null,
    winner:
      decision.kind === 'resolve' && decision.outcome !== 'CANCEL'
        ? decision.outcome
        : null,
    method: verifiedResult
      ? ufcMethod(bout.methodDetail)
        ? bout.methodDetail
        : bout.method
      : null,
    round: verifiedResult ? bout.resultRound : null,
    roundTime: verifiedResult ? bout.resultTime : null,
    scheduledRounds: bout.scheduledRounds,
    weightClass: bout.weightClass,
    onlyRemaining,
  }
}

export function isOfficialUfcWinnerMarket(contract: Contract) {
  return (
    isSportsContract(contract) &&
    contract.sportsMarketType === 'moneyline' &&
    officialBdlLeagueKey(contract) === 'mma'
  )
}

export function toUfcMarketBout(
  c: Contract,
  answers: readonly Answer[]
): UfcMarketBout | null {
  if (
    !isSportsContract(c) ||
    !isMultiCpmm(c) ||
    c.outcomeType !== 'MULTIPLE_CHOICE' ||
    !c.shouldAnswersSumToOne ||
    c.addAnswersMode !== 'DISABLED' ||
    c.visibility !== 'public' ||
    c.token !== 'MANA' ||
    c.deleted ||
    c.resolution === 'CANCEL' ||
    c.sportsMarketType !== 'moneyline' ||
    officialBdlLeagueKey(c) !== 'mma'
  )
    return null
  const event = parseBdlEventId(c.sportsEventId),
    observation = snapshot.safeParse(c.sportsUfc),
    ids = c.sportsEntrantIds
  if (
    !event ||
    !('entrantIds' in event) ||
    !observation.success ||
    observation.data.observedEventId !== c.sportsEventId ||
    !ids ||
    ids.length !== 3 ||
    ids[2] !== null ||
    ids[0] === ids[1] ||
    !event.entrantIds.every((i) => ids.includes(i))
  )
    return null
  const sorted = [...answers].sort((a, b) => a.index - b.index)
  if (
    sorted.length !== 3 ||
    new Set(sorted.map((a) => a.id)).size !== 3 ||
    sorted.some(
      (a, i) =>
        a.index !== i ||
        !a.id ||
        a.contractId !== c.id ||
        typeof a.text !== 'string' ||
        !a.text.trim() ||
        !Number.isFinite(a.prob) ||
        a.prob < 0 ||
        a.prob > 1
    ) ||
    new Set(
      sorted.map((a) =>
        a.text.normalize().trim().replace(/\s+/gu, ' ').toLowerCase()
      )
    ).size !== 3 ||
    sorted[2].text !== UFC_DRAW_ANSWER
  )
    return null
  // The creation-time fighter IDs and labels must still agree with the native ticket.
  if (
    sorted[0].text !== c.sportsHomeTeam ||
    sorted[1].text !== c.sportsAwayTeam
  )
    return null
  const o = observation.data
  const method = ufcMethod(o.method)
  const neutral =
    method === 'draw' || method === 'technical-draw' || method === 'no-contest'
  if (
    (o.round != null &&
      o.scheduledRounds != null &&
      o.round > o.scheduledRounds) ||
    (o.status !== 'final' &&
      [o.firstFinalAt, o.winner, o.method, o.round, o.roundTime].some(
        (v) => v != null
      )) ||
    (o.winner != null &&
      (!method ||
        (neutral
          ? o.winner !== 'draw-or-no-contest'
          : !event.entrantIds.some((id) => id === o.winner)))) ||
    (o.firstFinalAt != null &&
      (o.firstFinalAt > o.observedAt ||
        (o.lastNonfinalAt != null && o.lastNonfinalAt >= o.firstFinalAt))) ||
    (o.lastNonfinalAt != null && o.lastNonfinalAt > o.observedAt)
  )
    return null
  const picks = sorted.map((a, i) => ({
    answerId: a.id,
    fighterId: ids[i],
    name: a.text,
    prob: a.prob,
  }))
  const marked =
    o.status === 'final' && o.winner != null
      ? picks.find((p) =>
          o.winner === 'draw-or-no-contest'
            ? p.fighterId === null
            : p.fighterId === o.winner
        )?.answerId
      : null
  const weights = c.resolutions
  const validWeights =
    !weights ||
    (!!marked &&
      weights[marked] === 100 &&
      Object.entries(weights).every(
        ([id, weight]) =>
          picks.some((p) => p.answerId === id) &&
          weight === (id === marked ? 100 : 0)
      ))
  const answerFlagsAgree = sorted.every((a) => {
    const expected = a.id === marked ? 1 : 0
    return (
      (!a.resolution ||
        a.resolution === (expected ? 'YES' : 'NO') ||
        (a.resolution === 'MKT' && a.resolutionProbability === expected)) &&
      (a.resolutionProbability == null || a.resolutionProbability === expected)
    )
  })
  const agreesWithPayout =
    validWeights &&
    answerFlagsAgree &&
    ((!c.isResolved && !c.resolution) ||
      c.resolution === marked ||
      (c.resolution === 'MKT' &&
        (!!weights ||
          sorted.some((a) => a.id === marked && a.resolution === 'YES'))))
  return {
    ...o,
    id: c.id,
    eventId: c.sportsEventId,
    fightId: event.id,
    slug: c.slug,
    creatorUsername: c.creatorUsername,
    groupSlugs: c.groupSlugs ?? [],
    closeTime:
      typeof c.closeTime === 'number' && Number.isFinite(c.closeTime)
        ? c.closeTime
        : null,
    isResolved:
      !!c.resolution ||
      !!c.isResolved ||
      !!c.resolutions ||
      sorted.some((a) => !!a.resolution),
    winnerAnswerId: marked && agreesWithPayout ? marked : null,
    answers: picks,
  }
}

const segmentOrder = (s: UfcMarketBout['segment']) =>
  s ? UFC_SEGMENTS.indexOf(s) : 3
export function groupUfcCards(
  bouts: readonly UfcMarketBout[]
): UfcMarketCard[] {
  const cards = new Map<number, UfcMarketCard>()
  for (const b of [...bouts].sort(
    (a, b) => b.observedAt - a.observedAt || a.id.localeCompare(b.id)
  )) {
    const c = cards.get(b.cardId) ?? {
      id: b.cardId,
      name: b.cardName,
      date: b.cardDate,
      venue: b.venue,
      bouts: [],
    }
    c.bouts.push(b)
    cards.set(c.id, c)
  }
  return [...cards.values()]
    .map((c) => ({
      ...c,
      bouts: c.bouts.sort(
        (a, b) =>
          segmentOrder(a.segment) - segmentOrder(b.segment) ||
          (b.order ?? 0) - (a.order ?? 0) ||
          a.fightId - b.fightId
      ),
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
}
export function ufcCardDisplay(
  bouts: readonly UfcMarketBout[],
  now = Date.now()
) {
  const completed = bouts.filter((b) => b.status === 'final'),
    remaining = bouts.filter(
      (b) => b.status !== 'final' && b.status !== 'canceled'
    )
  const recent = [...completed].sort(
    (a, b) =>
      (b.firstFinalAt ?? 0) - (a.firstFinalAt ?? 0) || a.fightId - b.fightId
  )[0]
  const valid = (b: UfcMarketBout) =>
    b.firstFinalAt != null &&
    b.firstFinalAt <= b.observedAt &&
    b.lastNonfinalAt != null &&
    b.lastNonfinalAt < b.firstFinalAt
  const confirmedLast =
    !!recent &&
    valid(recent) &&
    completed.every(
      (b) =>
        b === recent || (valid(b) && b.firstFinalAt! <= recent.lastNonfinalAt!)
    )
  const live = remaining.filter(
    (b) => b.status === 'in_progress' && freshUfcObservation(b, now)
  )
  const next =
    remaining.length === 1 &&
    remaining[0].status === 'scheduled' &&
    remaining[0].onlyRemaining &&
    !remaining[0].suppressUpNext &&
    freshUfcObservation(remaining[0], now)
      ? remaining[0]
      : undefined
  return {
    recent,
    confirmedLast,
    live: live.length === 1 ? live[0] : undefined,
    next,
    remaining,
    completed,
  }
}
// Scheduled markets can use an advance listing until the segment starts. Live and
// sole-remaining claims use the same ten-minute receipt window as the sports feed.
export function ufcObservationEnd(b: UfcMarketBout) {
  const liveEnd = b.observedAt + LIVE_STALE_MS
  return b.status === 'scheduled' &&
    b.segmentStart != null &&
    b.observedAt < b.segmentStart
    ? Math.min(
        b.segmentStart,
        b.onlyRemaining ? liveEnd : b.observedAt + DAY_MS
      )
    : liveEnd
}

export function freshUfcObservation(b: UfcMarketBout, now: number) {
  return (
    b.observedEventId === b.eventId &&
    Number.isFinite(now) &&
    now >= b.observedAt &&
    now < ufcObservationEnd(b)
  )
}

export const ufcTicketBinding = (b: UfcMarketBout) =>
  JSON.stringify([
    'ufc',
    b.id,
    b.cardId,
    b.observedEventId,
    b.answers.map((a) => [a.answerId, a.fighterId, a.name]),
  ])

export function verifiedUfcTicket(
  ticket: { binding: string; closeTime: number },
  contract: Contract,
  answers: readonly Answer[],
  now: number
) {
  const bout = toUfcMarketBout(contract, answers)
  return bout &&
    Number.isFinite(ticket.closeTime) &&
    now < ticket.closeTime &&
    ufcCanBet(bout, now) &&
    ufcTicketBinding(bout) === ticket.binding
    ? bout
    : undefined
}

export function ufcCanBet(b: UfcMarketBout, now: number) {
  return (
    !b.isResolved &&
    freshUfcObservation(b, now) &&
    (b.status === 'scheduled' || b.status === 'in_progress') &&
    b.closeTime != null &&
    b.closeTime > now
  )
}
