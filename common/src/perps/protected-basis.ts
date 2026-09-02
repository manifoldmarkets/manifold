// Protected-basis settlement — Workstream A of the ManiPerp protected-basis
// plan. Pure, like amm.ts: every function takes a { pool, positions }
// snapshot and returns transition data; backend/shared/src/perps/engine.ts
// persists it. Nothing here performs I/O or reads a clock.
//
// Per position (direction d, notional q, cost basis c, protected basis b,
// entry Pe) at mark P, with π the paper's price PnL:
//
//   V = max(c + π, 0)     value — unchanged by everything here except claim
//                         ADL, which exists to change it
//   R = min(b, V)         own-pool claim, protected by the position's own side
//   E = max(V − b, 0)     contingent claim on the OPPOSING pool
//   D = max(b − V, 0)     unsettled paper loss
//
// so V = R + E and b = R + D. Per side: pool B, reserved C = Σb, unreserved
// H = B − C, and B − R = H + D. Committed state must satisfy
//
//   0 <= b <= c,  B >= C,  E_long <= D_short + H_short,  E_short <= D_long + H_long.
//
// `H` is NOT house capital: it holds subsidy, fees, liquidation-released
// basis and realized surplus alike. Workstream A lets all of it back current
// contingent claims; a later policy that discounts it (Workstream B) must
// first decide its provenance — see risk-policy-shadow.ts.
//
// Every formula reduces to #4030 at b = c: R is min(c, V), E is the positive
// price PnL, claim ADL is the paper's q' = s·q with c unchanged, and a close
// pays its principal from its own pool and its profit from the opposing one.

import {
  AdlSettlement,
  applyFunding,
  assertPerpPositionNumbers,
  assertPerpStateNumbers,
  getLeverage,
  getPositionValue,
  getReserveBasis,
  getUnrealizedEquity,
  liquidationPrice,
  PerpState,
  processLiquidations,
} from './amm'
import { PerpDirection, PerpPosition } from './position'

export const oppositePerpDirection = (
  direction: PerpDirection
): PerpDirection => (direction === 'long' ? 'short' : 'long')

/**
 * Below this, a difference between two mana amounts is representational,
 * not economic: a millionth of a mana, four orders of magnitude under the
 * smallest amount the product displays.
 */
export const PERP_DUST_FLOOR = 1e-6
/**
 * Above this the allowance stops growing with scale, so a corrupt pool
 * cannot turn the allowance into money: a ten-thousandth of a mana.
 */
export const PERP_DUST_CAP = 1e-4

/**
 * Absolute dust allowance for comparisons between quantities that are equal
 * in real arithmetic but reach the comparison by different float paths (a
 * pro-rata allocation summed back against its total, a pool debited in two
 * parts, a value rebuilt from a basis that funding scaled).
 *
 * The allowance has an ABSOLUTE floor on purpose. Rounding residues are
 * created at the scale of the state that produced them and then persist in
 * the pools after that state has shrunk: a M$5m row that claim ADL landed on
 * the boundary and that then closed leaves ulps of M$5m behind in a M$2 book;
 * a factor-0 settlement leaves ulps of the settled basis in a pool whose
 * remaining reserves are tiny. A tolerance that shrank with the CURRENT
 * scale would turn every such residue into an invariant violation — a
 * refused close, a halted tick — once the large row was gone. The floor
 * covers residues from books up to ~M$10m; above that the allowance grows
 * with the largest quantity involved (256 ulps of it), capped.
 */
export const perpDustTolerance = (...values: number[]) => {
  let scale = 1
  for (const value of values)
    if (Number.isFinite(value)) scale = Math.max(scale, Math.abs(value))
  return Math.min(
    PERP_DUST_CAP,
    Math.max(PERP_DUST_FLOOR, 256 * Number.EPSILON * scale)
  )
}

/**
 * THE affordability tolerance: one rule for the current-claim invariant, the
 * claim-ADL boundary, the contingent payment, the pool debit and the
 * pool >= Σb check. It is exactly the dust rule — deliberately with no
 * separate relative part — because slack admitted at one scale must still be
 * tolerated by every later check at a smaller scale, and that only holds
 * when no check ever allows more than the floor-bounded dust of the largest
 * quantity involved. Two checks that disagree on whether a claim is payable
 * are how a book accepted as solvent can refuse a guaranteed close, so
 * nothing may check this any other way. Callers pass the basis-sized
 * quantities the comparison derives from (a side's Σc, the pool, the claim)
 * as `scale`.
 */
export const perpClaimTolerance = (
  claim: number,
  available: number,
  scale = 0
) => perpDustTolerance(claim, available, scale)

/** Is `claim` payable from `available`? See perpClaimTolerance. */
export const isPerpClaimBacked = (
  claim: number,
  available: number,
  scale = 0
) =>
  Number.isFinite(claim) &&
  Number.isFinite(available) &&
  claim <= available + perpClaimTolerance(claim, available, scale)

/**
 * Pool debit with the SAME tolerance as the affordability predicate: a claim
 * the invariant accepted may leave the pool a tolerance below zero, and that
 * is representational dust, not a deficit. Anything larger stays negative so
 * the caller fails closed. The dust floor equals the escrow check's floor,
 * so a snap here never trips the ledger-vs-pools invariant.
 */
const debitPool = (pool: number, amount: number, scale: number) => {
  const next = pool - amount
  if (next >= 0) return next === 0 ? 0 : next
  return next >= -perpClaimTolerance(amount, pool, scale) ? 0 : next
}

/**
 * The smallest fraction a partial close may remove. A close below this is
 * either a rounding no-op (the surviving row is byte-identical, yet an event
 * is written and streaks advance) or streak farming; both are refused.
 */
export const PERP_MIN_CLOSE_FRACTION = 0.01

export class PerpProtectedInvariantError extends Error {
  readonly kind:
    | 'reserve-basis'
    | 'pool-below-reserves'
    | 'contingent-claims'
    | 'cross-side-transfer'
    | 'claim-unpayable'
    | 'invalid-input'
  constructor(kind: PerpProtectedInvariantError['kind'], message: string) {
    super(message)
    this.name = 'PerpProtectedInvariantError'
    this.kind = kind
  }
}

const fail = (
  kind: PerpProtectedInvariantError['kind'],
  message: string
): never => {
  throw new PerpProtectedInvariantError(kind, message)
}

const comparePositionKeys = (a: PerpPosition, b: PerpPosition) =>
  a.userId < b.userId
    ? -1
    : a.userId > b.userId
    ? 1
    : a.direction === b.direction
    ? 0
    : a.direction === 'long'
    ? -1
    : 1

/**
 * Live rows in canonical (userId, direction) order. Every aggregate in this
 * module sums in this order, so a result depends on the SET of rows and not
 * on the order the database happened to return them. That buys tolerance-
 * bounded order independence, not bitwise equality across arbitrary float
 * partitions — see the settlement tests for what is actually claimed.
 */
export const canonicalPerpPositions = (positions: PerpPosition[]) =>
  positions
    .filter((p) => p.size > 0)
    .slice()
    .sort(comparePositionKeys)

/** The legacy mirror, made explicit: a row without b reads as b = c. */
export const withReserveBasis = (position: PerpPosition): PerpPosition =>
  position.reserveBasis === undefined
    ? { ...position, reserveBasis: position.costBasis }
    : position

// -------- claims --------

export type PerpPositionClaims = {
  value: number
  reserveBasis: number
  /** R = min(b, V) */
  own: number
  /** E = max(V − b, 0) */
  contingent: number
  /** D = max(b − V, 0) */
  paperLoss: number
}

export const getPerpPositionClaims = (
  position: PerpPosition,
  price: number
): PerpPositionClaims => {
  const rawValue = getPositionValue(position, price)
  const reserveBasis = getReserveBasis(position)
  // Dead band: a value above b by less than dust is not a contingent claim.
  // V and b are basis-sized quantities that reach this comparison by
  // different float paths (funding scaled both; claim ADL rebuilt c from b),
  // so the difference is rounding. Treating it as a claim would let one ulp
  // settle a row at factor 0 when the opposing side has no allowance, or
  // fail a side-level check whose tolerance is measured at another scale.
  // The value is snapped onto b so V = R + E and b = R + D hold exactly.
  const excess = rawValue - reserveBasis
  const value =
    excess > 0 &&
    excess <= perpDustTolerance(rawValue, reserveBasis, position.costBasis)
      ? reserveBasis
      : rawValue
  return {
    value,
    reserveBasis,
    own: Math.min(reserveBasis, value),
    contingent: Math.max(value - reserveBasis, 0),
    paperLoss: Math.max(reserveBasis - value, 0),
  }
}

export type PerpSideAccounting = {
  side: PerpDirection
  /** B */
  pool: number
  /** C = Σb */
  reservedBasis: number
  /** Σc, for the c − b diagnostics */
  costBasis: number
  /** R = Σ min(b, V) */
  ownClaims: number
  /** E = Σ max(V − b, 0) */
  contingentClaims: number
  /** D = Σ max(b − V, 0) */
  paperLosses: number
  /** H = B − C */
  unreserved: number
  openInterest: number
  positionCount: number
  /** Rows with b < c — the ones whose recovery above b is contingent. */
  reducedBasisCount: number
  /** Σ (c − b) */
  basisDeficit: number
}

export const getPerpSideAccounting = (
  state: PerpState,
  side: PerpDirection,
  price: number
): PerpSideAccounting => {
  const pool = side === 'long' ? state.pool.L : state.pool.S
  let reservedBasis = 0
  let costBasis = 0
  let ownClaims = 0
  let contingentClaims = 0
  let paperLosses = 0
  let openInterest = 0
  let positionCount = 0
  let reducedBasisCount = 0
  let basisDeficit = 0
  for (const position of canonicalPerpPositions(state.positions)) {
    if (position.direction !== side) continue
    const claims = getPerpPositionClaims(position, price)
    reservedBasis += claims.reserveBasis
    costBasis += position.costBasis
    ownClaims += claims.own
    contingentClaims += claims.contingent
    paperLosses += claims.paperLoss
    openInterest += position.size
    positionCount += 1
    const deficit = position.costBasis - claims.reserveBasis
    if (deficit > perpDustTolerance(position.costBasis, claims.reserveBasis)) {
      reducedBasisCount += 1
      basisDeficit += deficit
    }
  }
  return {
    side,
    pool,
    reservedBasis,
    costBasis,
    ownClaims,
    contingentClaims,
    paperLosses,
    unreserved: pool - reservedBasis,
    openInterest,
    positionCount,
    reducedBasisCount,
    basisDeficit,
  }
}

export type PerpAccountingSnapshot = {
  long: PerpSideAccounting
  short: PerpSideAccounting
}

export const getPerpAccountingSnapshot = (
  state: PerpState,
  price: number
): PerpAccountingSnapshot => ({
  long: getPerpSideAccounting(state, 'long', price),
  short: getPerpSideAccounting(state, 'short', price),
})

/**
 * What legacy #4030 ADL would have transferred across sides on this state:
 * the amount by which a side's pool falls short of its own reserves
 * `Σ min(b, V)`. In a protected contract `B >= Σb >= Σ min(b, V)` makes this
 * zero by construction, so a nonzero value is an invariant violation the
 * engine must halt on rather than a state it may repair by moving mana.
 */
export const getPerpCrossSideDeficit = (state: PerpState, price: number) => {
  const deficit = (side: PerpDirection) => {
    const accounting = getPerpSideAccounting(state, side, price)
    return Math.max(accounting.ownClaims - accounting.pool, 0)
  }
  return { long: deficit('long'), short: deficit('short') }
}

// -------- invariants --------

export const assertPerpProtectedPosition = (
  position: PerpPosition,
  label = 'position'
) => {
  assertPerpPositionNumbers(position, label)
  if (position.reserveBasis === undefined)
    fail('reserve-basis', `${label} has no protected basis`)
}

/**
 * Fail closed before protected state is persisted or paid from. Strict:
 * only the one documented dust tolerance is allowed, and every side must
 * satisfy all four invariants at once.
 */
export const assertPerpProtectedState = (state: PerpState, price: number) => {
  assertPerpStateNumbers(state, price)
  state.positions.forEach((position, index) =>
    assertPerpProtectedPosition(position, `position ${index}`)
  )

  const snapshot = getPerpAccountingSnapshot(state, price)
  for (const side of ['long', 'short'] as const) {
    const own = snapshot[side]
    if (
      own.pool <
      own.reservedBasis -
        perpDustTolerance(own.pool, own.reservedBasis, own.costBasis)
    )
      fail(
        'pool-below-reserves',
        `${side} pool ${own.pool} is below its protected reserves ${own.reservedBasis}`
      )

    const opposing = snapshot[oppositePerpDirection(side)]
    const available = opposing.paperLosses + opposing.unreserved
    if (own.contingentClaims <= 0) continue
    if (
      !isPerpClaimBacked(
        own.contingentClaims,
        available,
        own.costBasis + opposing.costBasis
      )
    )
      fail(
        'contingent-claims',
        `${side} contingent claims ${own.contingentClaims} exceed opposing paper losses plus unreserved balance ${available}`
      )
  }

  const deficit = getPerpCrossSideDeficit(state, price)
  for (const side of ['long', 'short'] as const)
    if (
      deficit[side] >
      perpDustTolerance(snapshot[side].pool, snapshot[side].costBasis)
    )
      fail(
        'cross-side-transfer',
        `${side} pool would require a ${deficit[side]} cross-side transfer, which protected accounting forbids`
      )
}

// -------- just-in-time paper-loss settlement --------

export type PerpBasisSettlementAllocation = {
  userId: string
  direction: PerpDirection
  value: number
  paperLoss: number
  reserveBasisBefore: number
  reserveBasisAfter: number
  /** b reduction; positive. */
  delta: number
}

export type PerpBasisSettlement = {
  /** The side whose pool paid, i.e. whose underwater rows were settled. */
  side: PerpDirection
  /** W */
  claim: number
  /** D before settlement */
  paperLoss: number
  /** Σ delta_i (= min(W, D) within tolerance) */
  settled: number
  /** W − settled, taken from H */
  unreservedConsumed: number
  allocations: PerpBasisSettlementAllocation[]
}

/**
 * Consume a paying side's paper losses against a realized opposing claim W
 * (protected plan, "Just-in-time paper-loss settlement"):
 *
 *   delta   = min(W, D)        D = Σ D_i over the side's underwater rows
 *   delta_i = delta · D_i / D  (no allocation at all when D = 0)
 *   b_i'    = b_i − delta_i    never below the row's current value
 *
 * Does NOT touch the pool — payPerpContingentClaim composes the debit. Rows
 * keep q, c, Pe, leverage and liquidation price; only b moves. The residual
 * of the pro-rata rounding is assigned to the last underwater row in
 * canonical order, then clamped at that row's D_i, so the allocations sum to
 * delta within perpDustTolerance regardless of input row order.
 */
export const settlePerpPaperLoss = (
  state: PerpState,
  payingSide: PerpDirection,
  claim: number,
  price: number
): { state: PerpState; settlement: PerpBasisSettlement } => {
  if (!Number.isFinite(claim) || claim < 0)
    fail('invalid-input', 'contingent claim must be finite and non-negative')
  if (!Number.isFinite(price) || price <= 0)
    fail('invalid-input', 'oracle price must be finite and positive')

  const underwater = canonicalPerpPositions(state.positions)
    .filter((p) => p.direction === payingSide)
    .map((position) => ({
      position,
      claims: getPerpPositionClaims(position, price),
    }))
    .filter(({ claims }) => claims.paperLoss > 0)
  const paperLoss = underwater.reduce((sum, u) => sum + u.claims.paperLoss, 0)
  if (!Number.isFinite(paperLoss))
    fail('invalid-input', `${payingSide} paper losses must be finite`)

  const target = paperLoss > 0 && claim > 0 ? Math.min(claim, paperLoss) : 0
  const allocations: PerpBasisSettlementAllocation[] = []
  const reduced = new Map<string, number>()
  let allocated = 0
  underwater.forEach(({ position, claims }, index) => {
    if (target <= 0) return
    const isLast = index === underwater.length - 1
    const share = isLast
      ? target - allocated
      : target * (claims.paperLoss / paperLoss)
    const delta = Math.min(Math.max(share, 0), claims.paperLoss)
    if (!Number.isFinite(delta))
      fail('invalid-input', 'basis settlement allocation must be finite')
    if (delta <= 0) return
    // Never below current value: delta <= D_i = b_i − V_i already, and the
    // max() only absorbs the last ulp of the subtraction.
    const reserveBasisAfter = Math.max(
      claims.reserveBasis - delta,
      claims.value
    )
    allocated += delta
    reduced.set(`${position.userId}:${position.direction}`, reserveBasisAfter)
    allocations.push({
      userId: position.userId,
      direction: position.direction,
      value: claims.value,
      paperLoss: claims.paperLoss,
      reserveBasisBefore: claims.reserveBasis,
      reserveBasisAfter,
      delta,
    })
  })

  if (
    Math.abs(allocated - target) > perpDustTolerance(claim, paperLoss, target)
  )
    fail(
      'invalid-input',
      `basis settlement allocated ${allocated} against a target of ${target}`
    )

  const positions =
    allocations.length === 0
      ? state.positions
      : state.positions.map((position) => {
          const after = reduced.get(`${position.userId}:${position.direction}`)
          return after === undefined
            ? position
            : { ...position, reserveBasis: after }
        })

  return {
    state: { pool: state.pool, positions },
    settlement: {
      side: payingSide,
      claim,
      paperLoss,
      settled: allocated,
      unreservedConsumed: Math.max(claim - allocated, 0),
      allocations,
    },
  }
}

/**
 * Pay a realized contingent claim W to `claimantSide` out of the opposing
 * pool: settle that pool's paper losses first (loss-first), then debit W.
 * Fails closed when the unmatched remainder W − delta does not fit the
 * opposing unreserved balance H — a state the current-claim invariant makes
 * unreachable, so reaching it means the input was never validated.
 */
export const payPerpContingentClaim = (
  state: PerpState,
  claimantSide: PerpDirection,
  claim: number,
  price: number
): { state: PerpState; settlement: PerpBasisSettlement } => {
  const payingSide = oppositePerpDirection(claimantSide)
  const before = getPerpSideAccounting(state, payingSide, price)
  const claimant = getPerpSideAccounting(state, claimantSide, price)
  const settled = settlePerpPaperLoss(state, payingSide, claim, price)
  const { unreservedConsumed } = settled.settlement
  // Same predicate, same scale AND same claim as the invariant that admitted
  // this payment: the tolerance is keyed on the side's whole contingent
  // claim E (the invariant's quantity), never on the unmatched remainder
  // W − delta, which is smaller whenever the paying side holds paper losses
  // and would otherwise let the invariant accept what the payment refuses.
  const scale = Math.max(
    claim,
    claimant.contingentClaims,
    before.costBasis + claimant.costBasis
  )
  const tolerance = perpClaimTolerance(
    Math.max(claim, claimant.contingentClaims),
    before.paperLosses + before.unreserved,
    scale
  )
  if (
    !Number.isFinite(unreservedConsumed) ||
    !(unreservedConsumed <= before.unreserved + tolerance)
  )
    fail(
      'claim-unpayable',
      `${claimantSide} contingent claim ${claim} needs ${unreservedConsumed} of ${payingSide} unreserved balance but only ${before.unreserved} is available`
    )
  const pool =
    payingSide === 'long'
      ? { L: debitPool(state.pool.L, claim, scale), S: state.pool.S }
      : { L: state.pool.L, S: debitPool(state.pool.S, claim, scale) }
  if (pool.L < 0 || pool.S < 0)
    fail(
      'claim-unpayable',
      `${payingSide} pool cannot pay a ${claim} contingent claim`
    )
  return {
    state: { pool, positions: settled.state.positions },
    settlement: settled.settlement,
  }
}

// -------- generalized claim ADL --------

export type PerpProtectedAdlAdjustment = {
  previousPosition: PerpPosition
  position: PerpPosition
  scaleFactor: number
}

export type PerpProtectedAdlResult = {
  state: PerpState
  adlFactorLong: number
  adlFactorShort: number
  adjusted: PerpProtectedAdlAdjustment[]
  settled: AdlSettlement[]
  /** Contingent claim removed per side: E − s·E. */
  contingentReduced: { long: number; short: number }
  /** Always 0 in protected accounting; present so callers see it explicitly. */
  crossSideTransfer: 0
}

/**
 * Claim ADL against E = max(V − b, 0), not merely positive price PnL: a
 * position below its entry can still be above a previously reduced b.
 *
 *   available_d = D_opposite + H_opposite          (Workstream A: all of H)
 *   s_d         = min(1, available_d / E_d)         when E_d > 0
 *   q' = s·q,  c' = b + s·(c − b),  b' = b,  Pe' = Pe
 *
 * which maps E to s·E and reduces to the paper's q' = s·q, c' = c at b = c.
 * At s = 0 the row is removed and its protected basis b is paid once from
 * its own pool (the engine mirrors that with a user payout). originalCostBasis
 * and takerFeeCostBasis are left alone for 0 < s < 1 so the haircut stays
 * visible in user-facing PnL; at s = 0 the settlement event consumes them.
 */
export const applyPerpProtectedClaimAdl = (
  state: PerpState,
  price: number
): PerpProtectedAdlResult => {
  const positions = state.positions.map(withReserveBasis)
  const normalized: PerpState = { pool: state.pool, positions }
  const snapshot = getPerpAccountingSnapshot(normalized, price)

  // Representability. E and V are differences of basis-sized quantities, so
  // an allowance below the dust of the side's cost basis cannot be realized
  // by scaling: c' = b + s·(c − b) rounds to b's ulps and the scaled claim
  // comes out LARGER than the allowance it was meant to fit. Such an
  // allowance is economically zero, so the factor snaps to zero (the rows
  // are settled at b). Symmetrically, a side whose whole contingent claim is
  // within that dust has no claim and is left alone. Per row, dust claims
  // are already zero (getPerpPositionClaims' dead band), so every row with
  // E > 0 is scaled by the same factor and Σ s·E_i lands on the allowance
  // whatever the post-ADL scale of the side.
  const dustFor = (side: PerpDirection) =>
    perpDustTolerance(
      snapshot[side].contingentClaims,
      snapshot[side].costBasis + snapshot[oppositePerpDirection(side)].costBasis
    )
  const factorFor = (side: PerpDirection) => {
    const own = snapshot[side]
    if (own.contingentClaims <= dustFor(side)) return 1
    const opposing = snapshot[oppositePerpDirection(side)]
    const available = opposing.paperLosses + opposing.unreserved
    if (!Number.isFinite(available))
      fail('contingent-claims', `${side} claim ADL allowance must be finite`)
    if (available <= dustFor(side)) return 0
    const s = available / own.contingentClaims
    if (!Number.isFinite(s))
      fail('contingent-claims', `${side} claim ADL factor must be finite`)
    return s < 1 ? Math.max(s, 0) : 1
  }
  const adlFactorLong = factorFor('long')
  const adlFactorShort = factorFor('short')

  const adjusted: PerpProtectedAdlAdjustment[] = []
  const settled: AdlSettlement[] = []
  const contingentReduced = { long: 0, short: 0 }
  const next = positions
    .map((position) => {
      if (position.size <= 0) return position
      const factor =
        position.direction === 'long' ? adlFactorLong : adlFactorShort
      if (factor >= 1) return position
      const claims = getPerpPositionClaims(position, price)
      if (claims.contingent <= 0) return position

      if (factor === 0) {
        // Zero exposure remains; return the protected basis once. E > 0
        // means V > b, so R = b exactly.
        settled.push({ position, payout: claims.reserveBasis })
        contingentReduced[position.direction] += claims.contingent
        return null
      }

      const size = factor * position.size
      const costBasis =
        claims.reserveBasis +
        factor * (position.costBasis - claims.reserveBasis)
      const leverage = getLeverage(size, costBasis)
      const scaled: PerpPosition = {
        ...position,
        size,
        costBasis,
        reserveBasis: claims.reserveBasis,
        leverage,
        liquidationPrice: liquidationPrice(
          position.direction,
          position.entryPrice,
          leverage
        ),
      }
      adjusted.push({
        previousPosition: position,
        position: scaled,
        scaleFactor: factor,
      })
      contingentReduced[position.direction] += claims.contingent * (1 - factor)
      return scaled
    })
    .filter((p): p is PerpPosition => p != null)

  const longSettlementPayout = settled
    .filter((s) => s.position.direction === 'long')
    .reduce((sum, s) => sum + s.payout, 0)
  const shortSettlementPayout = settled
    .filter((s) => s.position.direction === 'short')
    .reduce((sum, s) => sum + s.payout, 0)

  const result: PerpProtectedAdlResult = {
    state: {
      pool: {
        L: debitPool(
          state.pool.L,
          longSettlementPayout,
          snapshot.long.costBasis
        ),
        S: debitPool(
          state.pool.S,
          shortSettlementPayout,
          snapshot.short.costBasis
        ),
      },
      positions: next,
    },
    adlFactorLong,
    adlFactorShort,
    adjusted,
    settled,
    contingentReduced,
    crossSideTransfer: 0,
  }

  // The scaled claims must fit the allowance they were scaled to, under the
  // same predicate the invariant uses. With the dust snap above, the
  // per-row dead band and the absolute dust floor this holds for every valid
  // input; keep it as the fail-closed proof rather than trusting the algebra.
  const after = getPerpAccountingSnapshot(result.state, price)
  for (const side of ['long', 'short'] as const) {
    const factor = side === 'long' ? adlFactorLong : adlFactorShort
    if (factor >= 1) continue
    const opposing = after[oppositePerpDirection(side)]
    if (
      !isPerpClaimBacked(
        after[side].contingentClaims,
        opposing.paperLosses + opposing.unreserved,
        after[side].costBasis + opposing.costBasis
      )
    )
      fail(
        'contingent-claims',
        `${side} claim ADL at factor ${factor} left ${
          after[side].contingentClaims
        } of contingent claim against ${
          opposing.paperLosses + opposing.unreserved
        } of backing`
      )
  }
  return result
}

// -------- oracle transition: liquidation + claim ADL --------

export type PerpProtectedOracleTransition = PerpProtectedAdlResult & {
  liquidated: PerpPosition[]
}

/**
 * The protected counterpart of processLiquidations + applyADL. Structure is
 * checked on the INPUT (a malformed row would otherwise be zeroed or removed
 * before the output check sees it); solvency is asserted on the OUTPUT, since
 * liquidation and ADL exist to repair it. A pre-state that legacy ADL would
 * have "repaired" with a cross-side transfer is rejected outright: in a
 * protected contract that state is an invariant violation, and the engine
 * halts on the error rather than moving pool balance.
 */
export const applyPerpProtectedOracleTransition = (
  state: PerpState,
  price: number
): PerpProtectedOracleTransition => {
  assertPerpStateNumbers(state, price)
  const normalized: PerpState = {
    pool: state.pool,
    positions: state.positions.map(withReserveBasis),
  }
  normalized.positions.forEach((position, index) =>
    assertPerpProtectedPosition(position, `position ${index}`)
  )

  const deficit = getPerpCrossSideDeficit(normalized, price)
  for (const side of ['long', 'short'] as const)
    if (deficit[side] > perpDustTolerance(normalized.pool.L, normalized.pool.S))
      fail(
        'cross-side-transfer',
        `${side} pool is ${deficit[side]} below its own reserves; legacy accounting would transfer across sides, which protected accounting forbids`
      )

  const liquidation = processLiquidations(normalized, price)
  const adl = applyPerpProtectedClaimAdl(liquidation.state, price)
  assertPerpProtectedState(adl.state, price)
  return { ...adl, liquidated: liquidation.liquidated }
}

// -------- funding --------

export type PerpProtectedFundingResult = PerpProtectedAdlResult & {
  fundedState: PerpState
}

/**
 * Funding scales q, c and b by one factor per side (applyFunding does that
 * for every row carrying b), then re-runs claim ADL at the unchanged mark:
 * a receiver's bonus can lift its value above b and create contingent claim
 * the opposing side cannot back. Input must already be protected-valid; a
 * funding tick must never launder an insolvency left by the oracle tick.
 */
export const applyPerpProtectedFunding = (
  state: PerpState,
  fundingRate: number,
  price: number
): PerpProtectedFundingResult => {
  if (!Number.isFinite(fundingRate))
    fail('invalid-input', 'funding rate must be finite')
  if (Math.abs(fundingRate) >= 1)
    fail('invalid-input', 'absolute funding rate must be below 1')
  const normalized: PerpState = {
    pool: state.pool,
    positions: state.positions.map(withReserveBasis),
  }
  assertPerpProtectedState(normalized, price)

  const funded = applyFunding(normalized, fundingRate)
  assertPerpStateNumbers(funded, price)
  funded.positions.forEach((position, index) =>
    assertPerpProtectedPosition(position, `funded position ${index}`)
  )
  const corrected = applyPerpProtectedClaimAdl(funded, price)
  if (
    !Number.isFinite(corrected.adlFactorLong) ||
    !Number.isFinite(corrected.adlFactorShort)
  )
    fail('contingent-claims', 'funding claim ADL factors must be finite')
  assertPerpProtectedState(corrected.state, price)
  return { ...corrected, fundedState: funded }
}

// -------- unified full / partial close --------

export type PerpProtectedCloseResult = {
  state: PerpState
  fraction: number
  /** z·V — what the user receives. */
  payout: number
  /** z·R, debited from the position's own pool. */
  ownPayout: number
  /** z·E, debited from the opposing pool after loss settlement. */
  contingentPayout: number
  /** z·π — the paper's price-only PnL for the closed fraction. */
  pricePnl: number
  closedSize: number
  closedCostBasis: number
  closedReserveBasis: number
  closedOriginalCostBasis: number
  closedTakerFeeCostBasis: number
  /** Null on a full close. */
  remainingPosition: PerpPosition | null
  /** Null when no contingent component was paid. */
  settlement: PerpBasisSettlement | null
  poolLongDelta: number
  poolShortDelta: number
}

/**
 * Close a fraction z of a position (protected plan, "Full or partial close"):
 *
 *   own-pool component  = z·R      opposing component = z·E
 *
 * The opposing pool's paper losses are settled with W = z·E before it pays
 * (payPerpContingentClaim), and the surviving row scales every basis —
 * q, c, b, originalCostBasis, takerFeeCostBasis — by (1 − z), which leaves
 * leverage, entry and liquidation price unchanged. A full close removes the
 * row. Economic capacity never rejects a close: the invariant guarantees
 * z·E fits D + H on the opposing side.
 */
export const closePerpProtectedPosition = (
  state: PerpState,
  position: Pick<PerpPosition, 'userId' | 'direction'>,
  price: number,
  fraction = 1,
  now?: number
): PerpProtectedCloseResult => {
  if (!Number.isFinite(fraction) || fraction <= 0 || fraction > 1)
    fail('invalid-input', 'close fraction must be finite and in (0, 1]')
  if (!Number.isFinite(price) || price <= 0)
    fail('invalid-input', 'oracle price must be finite and positive')
  const live = state.positions.find(
    (p) =>
      p.userId === position.userId &&
      p.direction === position.direction &&
      p.size > 0
  )
  if (!live)
    throw new PerpProtectedInvariantError(
      'invalid-input',
      'no open position to close'
    )
  const row = withReserveBasis(live)
  assertPerpProtectedPosition(row, 'closing position')

  const z = fraction
  const isFull = z >= 1
  const claims = getPerpPositionClaims(row, price)
  const payout = z * claims.value
  const ownPayout = z * claims.own
  const contingentPayout = z * claims.contingent
  const pricePnl = z * getUnrealizedEquity(row, price)

  // Own-pool leg first: it is the position's own reserved margin.
  const ownScale = getPerpSideAccounting(state, row.direction, price).costBasis
  const ownPool =
    row.direction === 'long'
      ? { L: debitPool(state.pool.L, ownPayout, ownScale), S: state.pool.S }
      : { L: state.pool.L, S: debitPool(state.pool.S, ownPayout, ownScale) }
  if (ownPool.L < 0 || ownPool.S < 0)
    fail(
      'claim-unpayable',
      `${row.direction} pool cannot return the position's protected basis`
    )

  let working: PerpState = { pool: ownPool, positions: state.positions }
  let settlement: PerpBasisSettlement | null = null
  if (contingentPayout > 0) {
    const paid = payPerpContingentClaim(
      working,
      row.direction,
      contingentPayout,
      price
    )
    working = paid.state
    settlement = paid.settlement
  }

  const remainingPosition: PerpPosition | null = isFull
    ? null
    : (() => {
        const keep = 1 - z
        const size = keep * row.size
        const costBasis = keep * row.costBasis
        const leverage = getLeverage(size, costBasis)
        return {
          ...row,
          size,
          costBasis,
          reserveBasis: keep * claims.reserveBasis,
          originalCostBasis: keep * row.originalCostBasis,
          takerFeeCostBasis: keep * (row.takerFeeCostBasis ?? 0),
          leverage,
          liquidationPrice: liquidationPrice(
            row.direction,
            row.entryPrice,
            leverage
          ),
          updatedTime: now ?? row.updatedTime,
        }
      })()

  // A partial close must materially change the row. Below the minimum
  // fraction, or where 1 − z rounds the survivor back onto the original,
  // there is nothing to settle and an event plus streak credit would be
  // written for a no-op.
  if (remainingPosition) {
    if (z < PERP_MIN_CLOSE_FRACTION)
      fail(
        'invalid-input',
        `close fraction must be at least ${PERP_MIN_CLOSE_FRACTION} or exactly 1`
      )
    if (
      !(remainingPosition.size < row.size) ||
      !(remainingPosition.costBasis < row.costBasis) ||
      payout <= perpDustTolerance(row.costBasis, claims.value)
    )
      fail(
        'invalid-input',
        'close fraction is too small to change the position'
      )
  }

  const positions = working.positions
    .map((p) =>
      p.userId === row.userId && p.direction === row.direction
        ? remainingPosition
        : p
    )
    .filter((p): p is PerpPosition => p != null)

  return {
    state: { pool: working.pool, positions },
    fraction: z,
    payout,
    ownPayout,
    contingentPayout,
    pricePnl,
    closedSize: isFull ? row.size : z * row.size,
    closedCostBasis: isFull ? row.costBasis : z * row.costBasis,
    closedReserveBasis: isFull ? claims.reserveBasis : z * claims.reserveBasis,
    closedOriginalCostBasis: isFull
      ? row.originalCostBasis
      : z * row.originalCostBasis,
    closedTakerFeeCostBasis: isFull
      ? row.takerFeeCostBasis ?? 0
      : z * (row.takerFeeCostBasis ?? 0),
    remainingPosition,
    settlement,
    poolLongDelta: working.pool.L - state.pool.L,
    poolShortDelta: working.pool.S - state.pool.S,
  }
}

// -------- batch resolution --------

export type PerpProtectedResolutionPayout = {
  position: PerpPosition
  payout: number
  ownPayout: number
  contingentPayout: number
  pricePnl: number
}

export type PerpProtectedResolution = {
  state: PerpState
  payouts: PerpProtectedResolutionPayout[]
  residual: number
  /** Opposing contingent claims funded by each side's paper losses. */
  paperLossConsumed: { long: number; short: number }
  /** Opposing contingent claims funded by each side's unreserved balance. */
  unreservedConsumed: { long: number; short: number }
}

/**
 * Terminal settlement from ONE immutable state (after liquidation and claim
 * ADL): every position's R and E are read at once and paid as a batch, so
 * the result cannot depend on which user is iterated first. The own pool
 * pays ΣR of its side; the opposing pool pays ΣE. Since B − R = H + D >= E
 * on both sides after ADL, both pools end non-negative and the remainder is
 * the residual returned under the existing resolution policy.
 */
export const resolvePerpProtectedBatch = (
  state: PerpState,
  price: number
): PerpProtectedResolution => {
  const normalized: PerpState = {
    pool: state.pool,
    positions: state.positions.map(withReserveBasis),
  }
  assertPerpProtectedState(normalized, price)
  const snapshot = getPerpAccountingSnapshot(normalized, price)

  const totals = {
    long: { own: 0, contingent: 0 },
    short: { own: 0, contingent: 0 },
  }
  const payouts = canonicalPerpPositions(normalized.positions).map(
    (position): PerpProtectedResolutionPayout => {
      const claims = getPerpPositionClaims(position, price)
      totals[position.direction].own += claims.own
      totals[position.direction].contingent += claims.contingent
      return {
        position,
        payout: claims.value,
        ownPayout: claims.own,
        contingentPayout: claims.contingent,
        pricePnl: getUnrealizedEquity(position, price),
      }
    }
  )

  const scale = snapshot.long.costBasis + snapshot.short.costBasis
  const L = debitPool(
    normalized.pool.L,
    totals.long.own + totals.short.contingent,
    scale
  )
  const S = debitPool(
    normalized.pool.S,
    totals.short.own + totals.long.contingent,
    scale
  )
  if (L < 0 || S < 0)
    fail(
      'claim-unpayable',
      `resolution cannot pay every claim from the pools (L=${L}, S=${S})`
    )

  const consumed = (side: PerpDirection) => {
    const claim = totals[oppositePerpDirection(side)].contingent
    const paperLoss = Math.min(claim, snapshot[side].paperLosses)
    return { paperLoss, unreserved: Math.max(claim - paperLoss, 0) }
  }
  const long = consumed('long')
  const short = consumed('short')

  return {
    state: { pool: { L, S }, positions: [] },
    payouts,
    residual: L + S,
    paperLossConsumed: { long: long.paperLoss, short: short.paperLoss },
    unreservedConsumed: { long: long.unreserved, short: short.unreserved },
  }
}

// -------- liquidity --------

/**
 * The most a side's pool can give up while keeping B >= Σb and the opposing
 * side's current contingent claims backed: H − max(E_opposite − D, 0).
 * Additions need no check (they only raise H). No withdrawal endpoint exists
 * for perps today; this pins the rule any future one must clip to, and it
 * never force-closes anyone.
 */
export const maxPerpLiquidityWithdrawal = (
  state: PerpState,
  side: PerpDirection,
  price: number
) => {
  const own = getPerpSideAccounting(state, side, price)
  const opposing = getPerpSideAccounting(
    state,
    oppositePerpDirection(side),
    price
  )
  const uncoveredClaims = Math.max(
    opposing.contingentClaims - own.paperLosses,
    0
  )
  const max = own.unreserved - uncoveredClaims
  return Number.isFinite(max) ? Math.max(max, 0) : 0
}
