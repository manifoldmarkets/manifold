// Workstream B risk-policy evaluators. READ-ONLY, BY CONSTRUCTION.
//
// Nothing exported from this module may be used to admit or refuse a trade,
// scale a position, move a pool, write an event, or pay a user. The engine
// calls these only when a contract's risk-policy mode is `shadow`, logs and
// stamps the results as diagnostics, and continues with the compatibility
// policy exactly as if they had never run. Enforcement of any candidate
// below needs its own approval and its own PR (protected plan, "Workstream B
// activation gates").
//
// Three separate controls, deliberately not coupled:
//
//   B1  current-claim allowance   available = D + alpha·H,  0 <= alpha <= 1
//   B2  new-exposure admission    limitCompat with U < M (candidate U = 1)
//   B3  exact stress test         E_d(P*) <= D_opp(P*) + (U/M)·H_opp
//
// The enforcing compatibility policy (U = M = 10, alpha = 1) lives in
// amm.ts as getPerpOpenInterestCapacity and is unchanged by this file.

import {
  getPerpOpenInterestCapacity,
  getPerpReserve,
  isPerpOpenInterestWithinLimit,
  PERP_OPEN_INTEREST_COVER_MULTIPLE,
  PerpOpenInterestCapacity,
  PerpState,
} from './amm'
import { PerpDirection } from './position'
import {
  getPerpAccountingSnapshot,
  getPerpPositionClaims,
  oppositePerpDirection,
  perpDustTolerance,
  withReserveBasis,
} from './protected-basis'

export type PerpAdmissionPolicy = {
  /** M — the adverse-move multiple; the stress mark is P·(1 ± 1/M). */
  coverMultiple: number
  /** U — the multiple applied to unreserved balance H. 0 <= U <= M. */
  unreservedMultiple: number
}

/** #4030's admission policy: every unit of H counts M times, like D. */
export const PERP_ADMISSION_POLICY_COMPAT: PerpAdmissionPolicy = {
  coverMultiple: PERP_OPEN_INTEREST_COVER_MULTIPLE,
  unreservedMultiple: PERP_OPEN_INTEREST_COVER_MULTIPLE,
}

/** The candidate under evaluation. Shadow only until separately approved. */
export const PERP_ADMISSION_POLICY_CANDIDATE: PerpAdmissionPolicy = {
  coverMultiple: PERP_OPEN_INTEREST_COVER_MULTIPLE,
  unreservedMultiple: 1,
}

/** Candidate current-claim allowances reported by the simulator. */
export const PERP_CLAIM_ALLOWANCE_ALPHA_CANDIDATES = [1, 0.5, 0.1] as const

export const assertPerpAdmissionPolicy = (policy: PerpAdmissionPolicy) => {
  const { coverMultiple: M, unreservedMultiple: U } = policy
  if (!Number.isFinite(M) || M <= 0)
    throw new Error('admission cover multiple must be finite and positive')
  if (!Number.isFinite(U) || U < 0 || U > M)
    throw new Error('admission unreserved multiple must satisfy 0 <= U <= M')
}

export const perpStressPrice = (
  side: PerpDirection,
  price: number,
  coverMultiple: number
) => {
  const x = 1 / coverMultiple
  return side === 'long' ? price * (1 + x) : price * (1 - x)
}

export type PerpCompatAdmissionInputs = {
  /** H_opposite */
  opposingUnreserved: number
  /** D_opposite(P) */
  opposingPaperLosses: number
  /** M·ΔD, before the opposing-OI cap */
  rawMatchedCredit: number
  opposingOpenInterest: number
  opposingPool: number
}

export type PerpCompatAdmissionLimit = {
  matchedCredit: number
  /** True when min(OI_opposite, rawMatchedCredit) selected the OI term. */
  matchedCreditCapBinds: boolean
  /** max(U·H + M·D(P), 0) + matchedCredit, before the defensive pool cap. */
  uncappedLimit: number
  limit: number
  /**
   * U·H + M·D(P*) = U·H + M·D(P) + rawMatchedCredit. Equals `limit` only
   * when the opposing-OI cap does not bind (and the pool cap does not
   * either); reported so a reviewer can see the collapse is NOT valid in
   * general.
   */
  naiveStressLimit: number
  naiveAgreesWithCompat: boolean
}

/**
 * The compatibility admission formula generalized to protected reserves
 * (protected plan, B2), as pure arithmetic on its inputs:
 *
 *   rawMatchedCredit = M·ΔD          ΔD = D_opp(P*) − D_opp(P)
 *   matchedCredit    = min(OI_opp, rawMatchedCredit)
 *   limitCompat      = max(U·H_opp + M·D_opp(P), 0) + matchedCredit
 *
 * capped at M·max(B_opp, 0) like #4030. At U = M this is exactly
 * #4030's `M·max(B − R, 0) + matchedCredit`, because B − R = H + D.
 */
export const calculatePerpCompatAdmissionLimit = (
  inputs: PerpCompatAdmissionInputs,
  policy: PerpAdmissionPolicy
): PerpCompatAdmissionLimit => {
  assertPerpAdmissionPolicy(policy)
  const { coverMultiple: M, unreservedMultiple: U } = policy
  const {
    opposingUnreserved,
    opposingPaperLosses,
    rawMatchedCredit,
    opposingOpenInterest,
    opposingPool,
  } = inputs
  for (const [label, value] of Object.entries(inputs))
    if (!Number.isFinite(value)) throw new Error(`${label} must be finite`)

  const matchedCredit = Math.min(opposingOpenInterest, rawMatchedCredit)
  const matchedCreditCapBinds = rawMatchedCredit >= opposingOpenInterest
  const base = Math.max(U * opposingUnreserved + M * opposingPaperLosses, 0)
  const uncappedLimit = base + matchedCredit
  const poolCap = M * Math.max(opposingPool, 0)
  const limit = Math.min(uncappedLimit, poolCap)
  const naiveStressLimit =
    U * opposingUnreserved + M * opposingPaperLosses + rawMatchedCredit
  return {
    matchedCredit,
    matchedCreditCapBinds,
    uncappedLimit,
    limit,
    naiveStressLimit,
    naiveAgreesWithCompat:
      Math.abs(naiveStressLimit - limit) <=
      perpDustTolerance(naiveStressLimit, limit),
  }
}

export type PerpAdmissionShadow = PerpCompatAdmissionLimit & {
  side: PerpDirection
  policy: PerpAdmissionPolicy
  openInterest: number
  opposingUnreserved: number
  opposingPaperLosses: number
  rawMatchedCredit: number
  opposingOpenInterest: number
  opposingPool: number
  headroom: number
  isWithinLimit: boolean
}

/**
 * Evaluate the compatibility admission formula for `side` under a candidate
 * policy against the given (typically post-trade) state. Shadow only.
 */
export const evaluatePerpAdmissionShadow = (
  side: PerpDirection,
  state: PerpState,
  price: number,
  policy: PerpAdmissionPolicy
): PerpAdmissionShadow => {
  assertPerpAdmissionPolicy(policy)
  const normalized: PerpState = {
    pool: state.pool,
    positions: state.positions.map(withReserveBasis),
  }
  const snapshot = getPerpAccountingSnapshot(normalized, price)
  const own = snapshot[side]
  const opposing = snapshot[oppositePerpDirection(side)]
  const stressPrice = perpStressPrice(side, price, policy.coverMultiple)
  const released = normalized.positions
    .filter((p) => p.direction === opposing.side && p.size > 0)
    .reduce(
      (sum, p) =>
        sum +
        Math.max(getPerpReserve(p, price) - getPerpReserve(p, stressPrice), 0),
      0
    )
  const inputs: PerpCompatAdmissionInputs = {
    opposingUnreserved: opposing.unreserved,
    opposingPaperLosses: opposing.paperLosses,
    rawMatchedCredit: released * policy.coverMultiple,
    opposingOpenInterest: opposing.openInterest,
    opposingPool: opposing.pool,
  }
  const limit = calculatePerpCompatAdmissionLimit(inputs, policy)
  return {
    ...limit,
    ...inputs,
    side,
    policy,
    openInterest: own.openInterest,
    headroom: Math.max(limit.limit - own.openInterest, 0),
    isWithinLimit: isPerpOpenInterestWithinLimit(own.openInterest, limit.limit),
  }
}

export type PerpExactStressShadow = {
  side: PerpDirection
  policy: PerpAdmissionPolicy
  stressPrice: number
  /** E_d(P*) */
  contingentClaimsAtStress: number
  /** D_opposite(P*) */
  opposingPaperLossesAtStress: number
  /** H_opposite (price-independent) */
  opposingUnreserved: number
  /** U/M */
  alpha: number
  /** D_opposite(P*) + alpha·H_opposite */
  allowance: number
  /** allowance − E_d(P*); negative means the exact rule would reject. */
  margin: number
  /** min(1, allowance / E_d(P*)) — the ADL the stress state would imply. */
  impliedStressAdlFactor: number
  passes: boolean
  /**
   * Notional a fresh standalone position (b = c, opened at the mark) could
   * still add before the exact rule binds: its stressed contingent claim is
   * exactly notional/M, so headroom is M·max(margin, 0). Linear only for a
   * standalone open at a fixed mark; an add merged into an existing row is
   * piecewise linear and is not solved here.
   */
  standaloneHeadroom: number
}

/**
 * B3, the exact protected-basis stress test, evaluated on the given state:
 *
 *   E_d(P*) <= D_opposite(P*) + (U/M)·H_opposite
 *
 * Reported alongside the compatibility gate so accept/reject disagreements
 * are visible. This rule does NOT reproduce legacy decisions at U = M.
 */
export const evaluatePerpExactStressShadow = (
  side: PerpDirection,
  state: PerpState,
  price: number,
  policy: PerpAdmissionPolicy
): PerpExactStressShadow => {
  assertPerpAdmissionPolicy(policy)
  const normalized: PerpState = {
    pool: state.pool,
    positions: state.positions.map(withReserveBasis),
  }
  const stressPrice = perpStressPrice(side, price, policy.coverMultiple)
  const stressed = getPerpAccountingSnapshot(normalized, stressPrice)
  const current = getPerpAccountingSnapshot(normalized, price)
  const opposite = oppositePerpDirection(side)
  const contingentClaimsAtStress = stressed[side].contingentClaims
  const opposingPaperLossesAtStress = stressed[opposite].paperLosses
  const opposingUnreserved = current[opposite].unreserved
  const alpha = policy.unreservedMultiple / policy.coverMultiple
  const allowance = opposingPaperLossesAtStress + alpha * opposingUnreserved
  const margin = allowance - contingentClaimsAtStress
  const impliedStressAdlFactor =
    contingentClaimsAtStress > 0
      ? Math.min(1, Math.max(allowance / contingentClaimsAtStress, 0))
      : 1
  return {
    side,
    policy,
    stressPrice,
    contingentClaimsAtStress,
    opposingPaperLossesAtStress,
    opposingUnreserved,
    alpha,
    allowance,
    margin,
    impliedStressAdlFactor,
    passes: margin >= -perpDustTolerance(allowance, contingentClaimsAtStress),
    standaloneHeadroom: policy.coverMultiple * Math.max(margin, 0),
  }
}

export type PerpAdmissionComparison = {
  side: PerpDirection
  /** The enforcing result (U = M), from getPerpOpenInterestCapacity. */
  compat: PerpOpenInterestCapacity
  candidate: PerpAdmissionShadow
  exact: PerpExactStressShadow
  /** The candidate policy would reject what the compatibility gate accepts. */
  candidateStricter: boolean
  /** The exact rule and the compatibility gate disagree, either way. */
  exactDisagrees: boolean
  headroomDifference: number
}

/**
 * One record per evaluated admission: the enforcing decision, the candidate
 * decision, the exact-stress decision, and whether they disagree. This is
 * the row the simulator and the shadow logs report.
 */
export const comparePerpAdmissionPolicies = (
  side: PerpDirection,
  state: PerpState,
  price: number,
  candidatePolicy: PerpAdmissionPolicy = PERP_ADMISSION_POLICY_CANDIDATE
): PerpAdmissionComparison => {
  const compat = getPerpOpenInterestCapacity(side, state, price)
  const candidate = evaluatePerpAdmissionShadow(
    side,
    state,
    price,
    candidatePolicy
  )
  const exact = evaluatePerpExactStressShadow(
    side,
    state,
    price,
    candidatePolicy
  )
  return {
    side,
    compat,
    candidate,
    exact,
    candidateStricter: compat.isWithinLimit && !candidate.isWithinLimit,
    exactDisagrees: compat.isWithinLimit !== exact.passes,
    headroomDifference: candidate.headroom - compat.headroom,
  }
}

export type PerpClaimAllowanceSideShadow = {
  side: PerpDirection
  contingentClaims: number
  opposingPaperLosses: number
  opposingUnreserved: number
  /** D_opposite + alpha·H_opposite */
  available: number
  /** min(1, available / E) */
  factor: number
  /** E − factor·E: contingent value the policy would claim-ADL right now. */
  projectedAdlAmount: number
  /** Rows the policy would fully settle (factor 0) right now. */
  wouldSettleCount: number
  /** Rows the policy would scale (0 < factor < 1) right now. */
  wouldScaleCount: number
}

export type PerpClaimAllowanceShadow = {
  alpha: number
  long: PerpClaimAllowanceSideShadow
  short: PerpClaimAllowanceSideShadow
}

/**
 * B1, the current-claim allowance `available = D + alpha·H`, projected on
 * the given state at the given mark. `alpha = 1` is Workstream A's actual
 * behaviour; anything lower can ADL incumbent contingent value at the next
 * transition, which is why it is measured before it is ever enforced. Note
 * the provenance caveat: with `alpha < 1`, a liquidation converts full-
 * strength D into discounted H and can trigger ADL purely because a loss was
 * realized — a persistent realized-loss-backing bucket would be needed first.
 */
export const evaluatePerpClaimAllowanceShadow = (
  state: PerpState,
  price: number,
  alpha: number
): PerpClaimAllowanceShadow => {
  if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1)
    throw new Error('claim allowance alpha must be finite and in [0, 1]')
  const normalized: PerpState = {
    pool: state.pool,
    positions: state.positions.map(withReserveBasis),
  }
  const snapshot = getPerpAccountingSnapshot(normalized, price)
  const evaluate = (side: PerpDirection): PerpClaimAllowanceSideShadow => {
    const own = snapshot[side]
    const opposing = snapshot[oppositePerpDirection(side)]
    const available = opposing.paperLosses + alpha * opposing.unreserved
    const factor =
      own.contingentClaims > 0
        ? Math.min(1, Math.max(available / own.contingentClaims, 0))
        : 1
    let wouldSettleCount = 0
    let wouldScaleCount = 0
    if (factor < 1)
      for (const position of normalized.positions) {
        if (position.direction !== side || position.size <= 0) continue
        if (getPerpPositionClaims(position, price).contingent <= 0) continue
        if (factor === 0) wouldSettleCount += 1
        else wouldScaleCount += 1
      }
    return {
      side,
      contingentClaims: own.contingentClaims,
      opposingPaperLosses: opposing.paperLosses,
      opposingUnreserved: opposing.unreserved,
      available,
      factor,
      projectedAdlAmount: own.contingentClaims * (1 - factor),
      wouldSettleCount,
      wouldScaleCount,
    }
  }
  return { alpha, long: evaluate('long'), short: evaluate('short') }
}
