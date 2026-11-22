import { MIN_CPMM_PROB } from '../contract'
import { ProviderGameStatus, ProviderOdds } from '../sports-provider'
import { SportsOpeningLine } from '../sports-kickoff-interface'
import { HOUR_MS, MINUTE_MS } from '../util/time'
import { selectOpeningLine } from './opening-line'
import {
  BDL_CANCELLATION_HOLD_MS,
  BDL_FINAL_SETTLEMENT_DELAY_MS,
} from './constants'

export const UFC_DRAW_ANSWER = 'Draw or no contest'
// This reserved third answer is unquoted by the two-sided fight moneyline.
export const UFC_DRAW_FLOOR = 0.02
export const UFC_OPPONENT_CHANGE_HOLD_MS = 2 * HOUR_MS
export const UFC_ACTIVE_POLL_MS = 90 * 1000
export const UFC_SEGMENTS = ['early_prelims', 'prelims', 'main_card'] as const
export type UfcSegment = (typeof UFC_SEGMENTS)[number]

export type UfcFighter = {
  id: number
  name: string
  born?: string
  nationality?: string
  heightInches?: number
  reachInches?: number
  stance?: string
  wins?: number
  losses?: number
  draws?: number
  noContests?: number
  rank?: number
}

export type UfcCard = {
  id: number
  name: string
  date: string
  venue?: string
  starts: Partial<Record<UfcSegment, number>>
}

export type UfcBout = {
  id: number
  eventId: string
  cardId: number
  fighters: [UfcFighter, UfcFighter]
  segment: UfcSegment | null
  order: number | null
  scheduledRounds: number | null
  headline: boolean
  titleFight: boolean
  weightClass?: string
  status: ProviderGameStatus
  winnerId: number | null
  method: string | null
  methodDetail: string | null
  resultRound: number | null
  resultTime: string | null
}

export function ufcOpeningLine(
  bout: UfcBout,
  rows: readonly ProviderOdds[],
  now: number
): SportsOpeningLine {
  const [a, b] = bout.fighters
  const line = selectOpeningLine(
    rows,
    {
      eventId: bout.eventId,
      league: 'mma',
      entrantIds: [String(a.id), String(b.id)],
    },
    now
  )
  if (line.probs.length !== 2) return line
  // Honor the minimum answer probability while reserving exactly the draw floor.
  const aProb = Math.max(
    MIN_CPMM_PROB,
    Math.min(
      1 - UFC_DRAW_FLOOR - MIN_CPMM_PROB,
      line.probs[0] * (1 - UFC_DRAW_FLOOR)
    )
  )
  return { ...line, probs: [aProb, 1 - UFC_DRAW_FLOOR - aProb, UFC_DRAW_FLOOR] }
}

export type UfcMethod =
  | 'decision'
  | 'technical-decision'
  | 'knockout'
  | 'submission'
  | 'disqualification'
  | 'draw'
  | 'technical-draw'
  | 'no-contest'

// Archived decision details also use "Victory by Decision - Split" and
// "Decision - Split (Draw)". Unrecognized free text is not winner evidence.
const decisionVote = (value: string | null) => {
  const s = value?.trim().toLowerCase() ?? ''
  const native =
    /^(?:victory by )?decision\s*-\s*(unanimous|split|majority)(?:\s*\(draw\))?$/.exec(
      s
    )
  const plain = /^(unanimous|split|majority) (decision|draw)$/.exec(s)
  return native
    ? { vote: native[1], draw: s.endsWith('(draw)') }
    : plain
    ? { vote: plain[1], draw: plain[2] === 'draw' }
    : null
}
export function ufcMethod(method: string | null): UfcMethod | null {
  const adjudication = decisionVote(method)
  if (adjudication) return adjudication.draw ? 'draw' : 'decision'
  switch (method?.trim().toLowerCase()) {
    case 'decision':
    case 'unanimous decision':
    case 'split decision':
    case 'majority decision':
      return 'decision'
    case 'technical decision':
      return 'technical-decision'
    case 'ko/tko':
    case 'ko':
    case 'tko':
    case 'knockout':
    case 'technical knockout':
      return 'knockout'
    case 'submission':
    case 'technical submission':
      return 'submission'
    case 'dq':
    case 'disqualification':
      return 'disqualification'
    case 'draw':
    case 'majority draw':
    case 'split draw':
    case 'unanimous draw':
      return 'draw'
    case 'technical draw':
      return 'technical-draw'
    case 'no contest':
    case 'no-contest':
    case 'nc':
      return 'no-contest'
    default:
      return null
  }
}

export function verifiedUfcMethod(
  primary: string | null,
  detail: string | null
) {
  const first = ufcMethod(primary),
    second = ufcMethod(detail)
  if (!first || !primary) return null
  const a = decisionVote(primary),
    b = decisionVote(detail)
  if (a && b && a.vote !== b.vote) return null
  const technicalDraw =
    (first === 'technical-draw' && second === 'draw') ||
    (first === 'draw' && second === 'technical-draw')
  const refinedDecision =
    primary.trim().toLowerCase() === 'decision' &&
    (second === 'technical-decision' ||
      second === 'technical-draw' ||
      second === 'draw')
  if (second && first !== second && !refinedDecision && !technicalDraw)
    return null
  const kind = technicalDraw
    ? 'technical-draw'
    : refinedDecision
    ? second!
    : first
  const vote = a?.vote ?? b?.vote
  const label =
    kind === 'technical-draw'
      ? first === kind
        ? primary
        : detail!
      : vote
      ? vote[0].toUpperCase() +
        vote.slice(1) +
        ' ' +
        (kind === 'draw' ? 'draw' : 'decision')
      : second
      ? detail!
      : primary
  return { kind, vote, label }
}

export type UfcObservation = { key: string; since: number; at: number }
export type UfcWinnerDecision =
  | {
      kind: 'hold' | 'attention'
      close: boolean
      reason: string
      observation: UfcObservation | null
    }
  | {
      kind: 'resolve'
      close: true
      outcome: number | 'draw-or-no-contest' | 'CANCEL'
      observation: UfcObservation
    }

/** A missing fight is never an observation of cancellation or a replacement.
 * Use the acquisition timestamp of the fresh fight page for each observation. */
export function ufcWinnerDecision(
  market: {
    fightId: number
    fighterIds: readonly [number, number]
    observedAt: number | null
    observation: UfcObservation | null
  },
  bout: UfcBout | null,
  at: number,
  settleMs = BDL_FINAL_SETTLEMENT_DELAY_MS
): UfcWinnerDecision {
  const previous = market.observation
  const hold = (
    reason: string,
    close = false,
    observation: UfcObservation | null = previous
  ): UfcWinnerDecision => ({ kind: 'hold', reason, close, observation })
  const attention = (reason: string, close: boolean): UfcWinnerDecision => ({
    kind: 'attention',
    reason,
    close,
    observation: null,
  })
  if (
    !Number.isFinite(at) ||
    at < 0 ||
    (market.observedAt != null && at <= market.observedAt) ||
    (previous && at <= previous.at)
  )
    return hold('No newer observation')
  if (!bout || bout.id !== market.fightId) return hold('Fight unobserved')
  const [left, right] = bout.fighters.map((f) => f.id).sort((a, b) => a - b)
  const [storedLeft, storedRight] = [...market.fighterIds].sort((a, b) => a - b)
  if (
    ![left, right, storedLeft, storedRight].every(
      (id) => Number.isSafeInteger(id) && id > 0
    ) ||
    left === right ||
    storedLeft === storedRight
  )
    return attention('Fight has invalid entrant identities', true)
  const observe = (key: string): UfcObservation => ({
    key,
    since: previous?.key === key ? previous.since : at,
    at,
  })
  if (left !== storedLeft || right !== storedRight) {
    const obs = observe('replacement:' + left + '-' + right)
    return at - obs.since >= UFC_OPPONENT_CHANGE_HOLD_MS
      ? { kind: 'resolve', close: true, outcome: 'CANCEL', observation: obs }
      : hold('Opponent changed', true, obs)
  }
  if (
    bout.status !== 'final' &&
    [
      bout.winnerId,
      bout.method,
      bout.methodDetail,
      bout.resultRound,
      bout.resultTime,
    ].some((value) => value != null)
  )
    return attention('Unsettled fight carries a result', true)
  if (bout.status === 'canceled') {
    const obs = observe('canceled')
    return at - obs.since >= BDL_CANCELLATION_HOLD_MS
      ? { kind: 'resolve', close: true, outcome: 'CANCEL', observation: obs }
      : hold('Fight canceled', true, obs)
  }
  if (bout.status !== 'final')
    return hold('Awaiting provider final', false, null)
  if (
    bout.resultRound != null &&
    (!Number.isSafeInteger(bout.resultRound) ||
      bout.resultRound < 1 ||
      (bout.scheduledRounds != null && bout.resultRound > bout.scheduledRounds))
  )
    return attention('Fight result exceeds scheduled rounds', true)
  const result = verifiedUfcMethod(bout.method, bout.methodDetail)
  if (!result)
    return attention('Unknown or conflicting fight result methods', true)
  const { kind: method, vote } = result
  const neutral =
    method === 'draw' || method === 'technical-draw' || method === 'no-contest'
  if (
    neutral
      ? bout.winnerId != null
      : !bout.fighters.some((f) => f.id === bout.winnerId)
  )
    return attention('Fight winner conflicts with the result or entrants', true)
  const outcome = neutral ? 'draw-or-no-contest' : bout.winnerId!
  const obs = observe(
    JSON.stringify(
      vote
        ? [outcome, method, bout.resultRound, bout.resultTime, vote]
        : [outcome, method, bout.resultRound, bout.resultTime]
    )
  )
  if (!Number.isFinite(settleMs) || settleMs < 0)
    return attention('Invalid settlement delay', true)
  return at - obs.since >= settleMs
    ? { kind: 'resolve', close: true, outcome, observation: obs }
    : hold('Checking fight result', true, obs)
}

/** No per-fight wall-clock start is published. Use the segment anchor for
 * creation and an explicit administrator-selected close rule for in-play. */
export function ufcCloseTime(
  card: UfcCard,
  bout: UfcBout,
  segmentSize: number,
  rule: 'in-play' | 'segment-start'
) {
  const start = bout.segment && card.starts[bout.segment]
  if (
    start == null ||
    !Number.isSafeInteger(start) ||
    start <= 0 ||
    card.id !== bout.cardId
  )
    return null
  if (rule === 'segment-start') return start
  if (
    !Number.isSafeInteger(segmentSize) ||
    segmentSize < 1 ||
    !Number.isSafeInteger(bout.order) ||
    !bout.order ||
    bout.order < 1 ||
    bout.order > segmentSize ||
    (bout.scheduledRounds !== 3 && bout.scheduledRounds !== 5)
  )
    return null
  // The feed ranks the headline first; the segment runs in the opposite order.
  // Allow scheduling/turnover time for earlier bouts as well as this bout's maximum.
  return (
    start +
    ((segmentSize - bout.order) * 45 +
      bout.scheduledRounds * 5 +
      (bout.scheduledRounds - 1) +
      30) *
      MINUTE_MS
  )
}
