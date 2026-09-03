// Migration decision tree and activation planning for protected accounting
// (protected plan, "Migration decision tree"). Pure: the guarded script under
// backend/scripts reads live state, calls these, and only then writes —
// inside one transaction under the contract advisory lock.
//
// Per side at one fixed cutover mark:
//
//   B  = pool balance
//   C  = Σc
//   Rc = Σ min(c, V)   current own-pool claims under legacy accounting
//
//   B >= C        covered  : initialize every b = c, no subsidy needed
//   Rc <= B < C   top-up   : prefer a house top-up of C − B, then b = c
//   B < Rc        deficit  : cannot preserve current claims; full C − B
//                            subsidy or stay legacy
//
// The classes are necessary, not sufficient: after the proposed backfill both
// cross-side current-claim inequalities must hold, or the approved activation
// ADL is applied atomically, or the contract does not activate.

import { getPositionValue, getReserveBasis, PerpState } from './amm'
import { PerpDirection, PerpEvent, PerpPosition } from './position'
import {
  applyPerpProtectedClaimAdl,
  assertPerpProtectedState,
  canonicalPerpPositions,
  getPerpAccountingSnapshot,
  oppositePerpDirection,
  perpDustTolerance,
  PerpProtectedAdlResult,
  PerpProtectedInvariantError,
} from './protected-basis'

export type PerpMigrationSideClass = 'covered' | 'top-up' | 'deficit'

export type PerpMigrationSideReport = {
  side: PerpDirection
  pool: number
  /** C = Σc */
  costBasisTotal: number
  /** Rc = Σ min(c, V) */
  currentClaims: number
  class: PerpMigrationSideClass
  /** max(C − B, 0): the house top-up that makes b = c safe. */
  requiredTopUp: number
  positionCount: number
}

export const classifyPerpMigrationSide = (
  state: PerpState,
  side: PerpDirection,
  price: number
): PerpMigrationSideReport => {
  const pool = side === 'long' ? state.pool.L : state.pool.S
  let costBasisTotal = 0
  let currentClaims = 0
  let positionCount = 0
  for (const position of state.positions) {
    if (position.direction !== side || position.size <= 0) continue
    costBasisTotal += position.costBasis
    currentClaims += Math.min(
      position.costBasis,
      getPositionValue(position, price)
    )
    positionCount += 1
  }
  for (const [label, value] of Object.entries({
    pool,
    costBasisTotal,
    currentClaims,
  }))
    if (!Number.isFinite(value))
      throw new Error(`${side} migration ${label} must be finite`)
  const dust = perpDustTolerance(pool, costBasisTotal, currentClaims)
  const cls: PerpMigrationSideClass =
    pool >= costBasisTotal - dust
      ? 'covered'
      : pool >= currentClaims - dust
      ? 'top-up'
      : 'deficit'
  return {
    side,
    pool,
    costBasisTotal,
    currentClaims,
    class: cls,
    requiredTopUp: Math.max(costBasisTotal - pool, 0),
    positionCount,
  }
}

export type PerpMigrationReport = {
  long: PerpMigrationSideReport
  short: PerpMigrationSideReport
  requiredTopUp: number
}

export const classifyPerpMigration = (
  state: PerpState,
  price: number
): PerpMigrationReport => {
  const long = classifyPerpMigrationSide(state, 'long', price)
  const short = classifyPerpMigrationSide(state, 'short', price)
  return {
    long,
    short,
    requiredTopUp: long.requiredTopUp + short.requiredTopUp,
  }
}

export type PerpLastResortAllocation = {
  userId: string
  direction: PerpDirection
  costBasis: number
  value: number
  loss: number
  reserveBasis: number
}

/**
 * The last-resort snapshot allocation for the middle (`top-up`) class only:
 *
 *   loss_i = max(c_i − V_i, 0),  loss = Σ loss_i,  b_i = c_i − (C − B)·loss_i/loss
 *
 * It assigns the historical deficit to whoever is underwater at the cutover
 * mark and is NOT user-conservative. It requires explicit product approval,
 * and it throws unless every proof obligation holds: loss > 0, C − B <= loss,
 * every b_i >= min(c_i, V_i), and every row actually reduced has b_i >= V_i.
 * Residual rounding is assigned deterministically to the last underwater row
 * in canonical order.
 */
export const allocateLastResortReserveBasis = (
  state: PerpState,
  side: PerpDirection,
  price: number
): PerpLastResortAllocation[] => {
  const report = classifyPerpMigrationSide(state, side, price)
  if (report.class !== 'top-up')
    throw new Error(
      `last-resort allocation applies only to the top-up class; ${side} is ${report.class}`
    )
  const deficit = report.costBasisTotal - report.pool
  const rows = state.positions
    .filter((p) => p.direction === side && p.size > 0)
    .slice()
    .sort((a, b) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0))
    .map((position) => {
      const value = getPositionValue(position, price)
      return { position, value, loss: Math.max(position.costBasis - value, 0) }
    })
  const loss = rows.reduce((sum, row) => sum + row.loss, 0)
  if (!(loss > 0))
    throw new Error(`${side} has no paper loss to allocate the deficit to`)
  if (deficit > loss + perpDustTolerance(deficit, loss))
    throw new Error(
      `${side} deficit ${deficit} exceeds its paper losses ${loss}; a subsidy is required`
    )

  const underwater = rows.filter((row) => row.loss > 0)
  let allocated = 0
  const reductions = new Map<string, number>()
  underwater.forEach((row, index) => {
    const isLast = index === underwater.length - 1
    const share = isLast ? deficit - allocated : deficit * (row.loss / loss)
    const reduction = Math.min(Math.max(share, 0), row.loss)
    allocated += reduction
    reductions.set(row.position.userId, reduction)
  })

  return rows.map(({ position, value, loss: rowLoss }) => {
    const reduction = reductions.get(position.userId) ?? 0
    // b_i = c_i − reduction_i, never below V_i (a reduced row keeps its
    // current value protected) and never above c_i: an in-profit row has no
    // loss, no reduction, and keeps b = c exactly.
    const reserveBasis = Math.min(
      position.costBasis,
      Math.max(position.costBasis - reduction, value)
    )
    const floor = Math.min(position.costBasis, value)
    if (reserveBasis < floor - perpDustTolerance(reserveBasis, floor))
      throw new Error(
        `last-resort allocation would put ${position.userId}'s reserve basis below its current claim`
      )
    if (reduction > 0 && reserveBasis < value - perpDustTolerance(value))
      throw new Error(
        `last-resort allocation would reduce ${position.userId}'s reserve basis below its current value`
      )
    return {
      userId: position.userId,
      direction: position.direction,
      costBasis: position.costBasis,
      value,
      loss: rowLoss,
      reserveBasis,
    }
  })
}

export type PerpActivationAllocationPolicy =
  | 'full-basis'
  | 'last-resort-snapshot'

export type PerpActivationPlanOptions = {
  /** Approved house top-up per side, added to the pools before allocation. */
  topUp: { long: number; short: number }
  allocation: PerpActivationAllocationPolicy
  /** Apply claim ADL at activation if the current-claim inequalities fail. */
  allowActivationAdl: boolean
}

export type PerpActivationPositionRecord = {
  userId: string
  direction: PerpDirection
  costBasis: number
  reserveBasisBefore: number
  reserveBasisAfter: number
}

export type PerpActivationTrim = {
  userId: string
  direction: PerpDirection
  /** Dust removed from this row's b so its pool holds every reserve it promises. */
  amount: number
}

export type PerpActivationPlan = {
  ok: boolean
  blockers: string[]
  report: PerpMigrationReport
  /** State after top-ups, b allocation and the dust trim, before any activation ADL. */
  backfilledState: PerpState
  allocations: PerpActivationPositionRecord[]
  /** True when some row received b < c (beyond dust). */
  reducedAnyBasis: boolean
  /** Dust trims applied so that B >= Σb holds exactly, not within tolerance. */
  trims: PerpActivationTrim[]
  /** Null when the backfilled state already satisfies every invariant. */
  activationAdl: PerpProtectedAdlResult | null
  finalState: PerpState
  invariantErrors: string[]
}

/**
 * Plan a protected activation at one fixed mark. Never mutates its input.
 * `ok` is false whenever a blocker exists; the caller must not activate.
 */
export const planPerpProtectedActivation = (
  state: PerpState,
  price: number,
  options: PerpActivationPlanOptions
): PerpActivationPlan => {
  const blockers: string[] = []
  const { topUp, allocation, allowActivationAdl } = options
  for (const side of ['long', 'short'] as const)
    if (!Number.isFinite(topUp[side]) || topUp[side] < 0)
      blockers.push(`${side} top-up must be finite and non-negative`)
  if (!Number.isFinite(price) || price <= 0)
    blockers.push('invalid cutover mark')

  const withTopUp: PerpState = {
    pool: {
      L: state.pool.L + (Number.isFinite(topUp.long) ? topUp.long : 0),
      S: state.pool.S + (Number.isFinite(topUp.short) ? topUp.short : 0),
    },
    positions: state.positions,
  }
  const report = classifyPerpMigration(withTopUp, price)

  const allocations: PerpActivationPositionRecord[] = []
  let positions: PerpPosition[] = withTopUp.positions
  let reducedAnyBasis = false
  for (const side of ['long', 'short'] as const) {
    const sideReport = report[side]
    if (sideReport.class === 'covered') continue
    if (sideReport.class === 'deficit') {
      blockers.push(
        `${side} pool ${sideReport.pool} is below current claims ${sideReport.currentClaims}; requires the full ${sideReport.requiredTopUp} top-up`
      )
      continue
    }
    if (allocation !== 'last-resort-snapshot') {
      blockers.push(
        `${side} pool ${sideReport.pool} is below Σc ${sideReport.costBasisTotal}; top up ${sideReport.requiredTopUp} or approve the last-resort allocation`
      )
      continue
    }
    try {
      const allocated = allocateLastResortReserveBasis(withTopUp, side, price)
      const bySide = new Map(allocated.map((a) => [a.userId, a.reserveBasis]))
      positions = positions.map((p) => {
        if (p.direction !== side || p.size <= 0) return p
        const reserveBasis = bySide.get(p.userId)
        if (reserveBasis === undefined) return p
        if (reserveBasis < p.costBasis - perpDustTolerance(p.costBasis))
          reducedAnyBasis = true
        return { ...p, reserveBasis }
      })
    } catch (error) {
      blockers.push(error instanceof Error ? error.message : String(error))
    }
  }

  const untrimmed: PerpPosition[] = positions.map((p) =>
    p.size <= 0
      ? { ...p, reserveBasis: 0 }
      : p.reserveBasis === undefined
      ? { ...p, reserveBasis: p.costBasis }
      : p
  )
  // Committed state must be cash-backed EXACTLY: B >= Σb in real arithmetic,
  // not within dust. The classifier admits B >= C − dust and the last-resort
  // allocation lands Σb on B within rounding, so a dust shortfall is
  // possible here; it is trimmed from the canonically last row's b so the
  // pool holds every reserve it promises (a claim the pool cannot pay is
  // not a reserve). A larger shortfall is a blocker.
  const trims: PerpActivationTrim[] = []
  const trimmed = untrimmed.map((p) => ({ ...p }))
  for (const side of ['long', 'short'] as const) {
    const pool = side === 'long' ? withTopUp.pool.L : withTopUp.pool.S
    const rows = canonicalPerpPositions(trimmed).filter(
      (p) => p.direction === side && p.size > 0
    )
    const reserved = rows.reduce((sum, p) => sum + (p.reserveBasis ?? 0), 0)
    const costBasis = rows.reduce((sum, p) => sum + p.costBasis, 0)
    let shortfall = reserved - pool
    if (!(shortfall > 0)) continue
    if (shortfall > perpDustTolerance(pool, reserved, costBasis)) {
      blockers.push(
        `${side} pool ${pool} is below its protected reserves ${reserved} after backfill`
      )
      continue
    }
    for (let i = rows.length - 1; i >= 0 && shortfall > 0; i--) {
      const row = rows[i]
      const by = Math.min(row.reserveBasis ?? 0, shortfall)
      if (by <= 0) continue
      row.reserveBasis = (row.reserveBasis ?? 0) - by
      shortfall -= by
      trims.push({ userId: row.userId, direction: row.direction, amount: by })
    }
    if (shortfall > 0)
      blockers.push(
        `${side} reserve shortfall ${shortfall} could not be trimmed`
      )
  }
  const backfilled: PerpState = { pool: withTopUp.pool, positions: trimmed }
  for (const p of backfilled.positions)
    allocations.push({
      userId: p.userId,
      direction: p.direction,
      costBasis: p.costBasis,
      reserveBasisBefore: p.costBasis,
      reserveBasisAfter: p.reserveBasis ?? p.costBasis,
    })

  const invariantErrors: string[] = []
  let activationAdl: PerpProtectedAdlResult | null = null
  let finalState = backfilled
  if (blockers.length === 0) {
    try {
      assertPerpProtectedState(backfilled, price)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      invariantErrors.push(message)
      const repairable =
        error instanceof PerpProtectedInvariantError &&
        error.kind === 'contingent-claims'
      if (repairable && allowActivationAdl) {
        activationAdl = applyPerpProtectedClaimAdl(backfilled, price)
        finalState = activationAdl.state
        try {
          assertPerpProtectedState(finalState, price)
        } catch (adlError) {
          blockers.push(
            `activation ADL did not restore the invariants: ${
              adlError instanceof Error ? adlError.message : String(adlError)
            }`
          )
        }
      } else {
        blockers.push(
          repairable
            ? `current-claim invariants fail after backfill; activation ADL required but not approved: ${message}`
            : `invariants fail after backfill: ${message}`
        )
      }
    }
  }

  return {
    ok: blockers.length === 0,
    blockers,
    report,
    backfilledState: backfilled,
    allocations,
    reducedAnyBasis,
    trims,
    activationAdl,
    finalState,
    invariantErrors,
  }
}

export type PerpDowngradeVerification = {
  allowed: boolean
  blockers: string[]
}

/**
 * Rollback boundary (protected plan, "Rollback boundary"). Returning a
 * protected contract to legacy is allowed only while the immutable records
 * prove nothing v2-divergent has happened: every live b = c, no basis
 * settlement, no activation reduction, no partial close, and no event whose
 * protected-basis delta diverged from its cost-basis delta.
 */
export const verifyPerpAccountingDowngrade = (args: {
  positions: PerpPosition[]
  eventsSinceActivation: PerpEvent[]
  activationReducedBasis: boolean
}): PerpDowngradeVerification => {
  const blockers: string[] = []
  if (args.activationReducedBasis)
    blockers.push('activation allocated reserve basis below cost basis')
  for (const p of args.positions) {
    if (p.size <= 0) continue
    const b = p.reserveBasis
    if (b === undefined) {
      blockers.push(`${p.userId} ${p.direction} has no protected basis`)
      continue
    }
    if (b !== p.costBasis)
      blockers.push(
        `${p.userId} ${p.direction} has reserve basis ${b} below cost basis ${p.costBasis}`
      )
  }
  for (const event of args.eventsSinceActivation) {
    if (event.eventType === 'basis-settlement') {
      blockers.push(`basis settlement event ${event.id ?? 'pending'}`)
      continue
    }
    if (event.eventType === 'accounting-activation') continue
    const fraction = event.data?.fraction
    if (
      event.eventType === 'close' &&
      typeof fraction === 'number' &&
      fraction < 1
    ) {
      blockers.push(`partial close event ${event.id ?? 'pending'}`)
      continue
    }
    const reserveDelta = event.reserveBasisDelta ?? event.costBasisDelta
    if (reserveDelta !== event.costBasisDelta)
      blockers.push(
        `event ${
          event.id ?? 'pending'
        } moved reserve basis by ${reserveDelta} but cost basis by ${
          event.costBasisDelta
        }`
      )
  }
  return { allowed: blockers.length === 0, blockers }
}

/** Convenience for reports: the four invariants on one state, as booleans. */
export const summarizePerpInvariants = (state: PerpState, price: number) => {
  const snapshot = getPerpAccountingSnapshot(
    {
      pool: state.pool,
      positions: state.positions.map((p) =>
        p.reserveBasis === undefined ? { ...p, reserveBasis: p.costBasis } : p
      ),
    },
    price
  )
  const side = (d: PerpDirection) => {
    const own = snapshot[d]
    const opposing = snapshot[oppositePerpDirection(d)]
    return {
      poolCoversReserves:
        own.pool >=
        own.reservedBasis - perpDustTolerance(own.pool, own.reservedBasis),
      contingentClaimsBacked:
        own.contingentClaims <=
        opposing.paperLosses +
          opposing.unreserved +
          perpDustTolerance(own.contingentClaims, opposing.pool),
    }
  }
  return { long: side('long'), short: side('short'), snapshot }
}

/** The rows an activation plan leaves with b below c, with the exact numbers. */
export const perpActivationReductions = (plan: PerpActivationPlan) =>
  plan.allocations.filter(
    (a) =>
      a.reserveBasisAfter <
      a.reserveBasisBefore - perpDustTolerance(a.reserveBasisBefore)
  )

const fnv1a32 = (text: string, seed: number) => {
  let hash = seed >>> 0
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/**
 * A short deterministic digest of everything an activation plan depends on:
 * the cutover mark, both pools, and every live row's size, cost basis and
 * current protected basis, in canonical row order. The dry run prints it and
 * the live run refuses to commit a reviewed reduction (last-resort
 * allocation, activation ADL) unless the book still has this exact digest —
 * so a legacy trade, settlement, subsidy or tick between review and
 * execution aborts instead of silently reallocating, even when the mark
 * itself is unchanged. Not a security primitive; a change detector.
 */
export const perpActivationFingerprint = (state: PerpState, price: number) => {
  const rows = canonicalPerpPositions(
    state.positions.filter((p) => p.size > 0)
  ).map((p) =>
    [
      p.userId,
      p.direction,
      p.size,
      p.costBasis,
      getReserveBasis(p),
      p.entryPrice,
    ].join(':')
  )
  const text = [price, state.pool.L, state.pool.S, ...rows].join('|')
  return fnv1a32(text, 0x811c9dc5) + fnv1a32(text, 0x9747b28c)
}

/**
 * Digest of the whole reviewed PLAN, not only the book it was computed on:
 * the book fingerprint, every plan input (top-ups, allocation policy,
 * whether an activation ADL is approved) and every outcome (each row's b
 * before/after, trims, final pools, ADL factors, blockers). The dry run
 * prints it; the live run recomputes the plan under the lock and refuses to
 * commit unless the digest is identical, so an approval can never authorize
 * a materially different haircut — a different top-up on the same book
 * included.
 */
export const perpActivationPlanDigest = (
  state: PerpState,
  price: number,
  options: PerpActivationPlanOptions,
  plan: PerpActivationPlan
) => {
  const allocations = plan.allocations
    .slice()
    .sort((a, b) =>
      `${a.userId}:${a.direction}` < `${b.userId}:${b.direction}` ? -1 : 1
    )
    .map((a) =>
      [
        a.userId,
        a.direction,
        a.costBasis,
        a.reserveBasisBefore,
        a.reserveBasisAfter,
      ].join(':')
    )
  const text = [
    perpActivationFingerprint(state, price),
    `topUp:${options.topUp.long}:${options.topUp.short}`,
    `allocation:${options.allocation}`,
    `allowAdl:${options.allowActivationAdl}`,
    `ok:${plan.ok}`,
    `reduced:${plan.reducedAnyBasis}`,
    `pools:${plan.finalState.pool.L}:${plan.finalState.pool.S}`,
    plan.activationAdl
      ? `adl:${plan.activationAdl.adlFactorLong}:${plan.activationAdl.adlFactorShort}:${plan.activationAdl.settled.length}:${plan.activationAdl.adjusted.length}`
      : 'adl:none',
    ...allocations,
    ...plan.trims.map((t) => `trim:${t.userId}:${t.direction}:${t.amount}`),
    ...plan.blockers.map((b) => `blocker:${b}`),
  ].join('|')
  return fnv1a32(text, 0x811c9dc5) + fnv1a32(text, 0x9747b28c)
}
