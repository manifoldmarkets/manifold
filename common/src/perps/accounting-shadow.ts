// Accounting shadow: the forward checkpoint/replay state behind
// `perpAccountingMode = 'shadow'`. Pure.
//
// A shadow contract commits LEGACY ledgers. Alongside, the engine keeps an
// isolated checkpoint of the protected-basis state the contract WOULD have
// — pools, positions and their b — and advances it through the protected
// counterpart of every live transition (open/add/flip, close, oracle tick,
// funding, subsidy, resolution). After each step the checkpoint is compared
// with the live state and the report is persisted next to the checkpoint,
// never in a financial row: the checkpoint is not read by any payout path
// and no hypothetical b is ever written to contract_perp_positions.
//
// That is what makes shadow a CUMULATIVE validation of an existing market
// rather than a single-transition check: the checkpoint carries the
// path-dependent b forward. When the protected transition cannot be applied
// (an invariant the legacy state violates, a row the shadow no longer holds
// because protected ADL removed it), the report records the divergence and
// the checkpoint is re-seeded from the live state with b = c.

import { accruePerpPositionTakerFee, creditPerpPoolFee } from './fees'
import { getReserveBasis, openPosition, PerpPool, PerpState } from './amm'
import { PerpDirection, PerpPosition } from './position'
import {
  applyPerpProtectedFunding,
  applyPerpProtectedOracleTransition,
  closePerpProtectedPosition,
  getPerpAccountingSnapshot,
  perpDustTolerance,
  resolvePerpProtectedBatch,
  withReserveBasis,
} from './protected-basis'
import { summarizePerpInvariants } from './protected-migration'

export type PerpShadowCheckpoint = {
  /** The accounting epoch this checkpoint belongs to; a new epoch re-seeds. */
  epoch: number
  pool: PerpPool
  positions: PerpPosition[]
  transitions: number
  divergences: number
  reseeds: number
}

export type PerpShadowTransitionInput =
  | {
      kind: 'open'
      userId: string
      contractId: string
      direction: PerpDirection
      mana: number
      leverage: number
      fee: number
      price: number
      now: number
    }
  | {
      kind: 'close'
      userId: string
      direction: PerpDirection
      fraction: number
      price: number
      now: number
      /** What the legacy ledger actually paid, for the payout comparison. */
      livePayout?: number
    }
  | { kind: 'oracle'; price: number }
  | { kind: 'funding'; fundingRate: number; price: number }
  | { kind: 'subsidy'; side: PerpDirection; amount: number }
  | {
      kind: 'resolve'
      price: number
      /** What the legacy ledger paid the creator as residual, for the comparison. */
      liveResidual?: number
    }

export type PerpShadowPositionDifference = {
  userId: string
  direction: PerpDirection
  /** shadow − live; null when the row exists on one side only. */
  sizeDifference: number | null
  costBasisDifference: number | null
  shadowReserveBasis: number | null
  status: 'both' | 'shadow-only' | 'live-only'
}

export type PerpShadowReport = {
  kind: PerpShadowTransitionInput['kind']
  /** The protected counterpart applied cleanly to the checkpoint. */
  applied: boolean
  error: string | null
  reseeded: boolean
  /** shadow − live */
  poolDifference: { long: number; short: number }
  positionDifferences: PerpShadowPositionDifference[]
  /** Σ(c − b) and rows with b < c in the SHADOW state. */
  basisDeficit: number
  reducedBasisCount: number
  /** Would the protected invariants hold on the shadow state / the live state (b = c)? */
  shadowInvariants: ReturnType<typeof summarizePerpInvariants>['long'] & {
    short: ReturnType<typeof summarizePerpInvariants>['short']
  }
  liveInvariants: ReturnType<typeof summarizePerpInvariants>['long'] & {
    short: ReturnType<typeof summarizePerpInvariants>['short']
  }
  /**
   * protected − legacy: the user payout for closes, the creator residual for
   * resolution. Null for the other kinds or when the live figure was not
   * supplied.
   */
  payoutDifference: number | null
  /**
   * Any pool/row difference beyond dust, a missing row, an error, or a
   * payout/residual the protected rules would have paid differently.
   */
  divergent: boolean
}

const key = (p: { userId: string; direction: PerpDirection }) =>
  `${p.userId}:${p.direction}`

const mirrored = (state: PerpState): PerpState => ({
  pool: { L: state.pool.L, S: state.pool.S },
  positions: state.positions
    .filter((p) => p.size > 0)
    .map((p) => ({ ...withReserveBasis(p) })),
})

/** Start (or restart) the shadow from the live state with b = c. */
export const seedPerpShadowCheckpoint = (
  live: PerpState,
  epoch: number,
  previous?: Pick<
    PerpShadowCheckpoint,
    'transitions' | 'divergences' | 'reseeds'
  >
): PerpShadowCheckpoint => {
  const state = mirrored(live)
  return {
    epoch,
    pool: state.pool,
    positions: state.positions,
    transitions: previous?.transitions ?? 0,
    divergences: previous?.divergences ?? 0,
    reseeds: previous?.reseeds ?? 0,
  }
}

const applyProtectedCounterpart = (
  state: PerpState,
  input: PerpShadowTransitionInput
): { state: PerpState; payout: number | null } => {
  switch (input.kind) {
    case 'open': {
      let working = state
      const opposite = working.positions.find(
        (p) =>
          p.userId === input.userId &&
          p.direction !== input.direction &&
          p.size > 0
      )
      if (opposite)
        working = closePerpProtectedPosition(
          working,
          opposite,
          input.price,
          1,
          input.now
        ).state
      const existingSame = working.positions.find(
        (p) =>
          p.userId === input.userId &&
          p.direction === input.direction &&
          p.size > 0
      )
      const opened = openPosition(
        working,
        input.userId,
        input.contractId,
        input.direction,
        input.mana,
        input.leverage,
        input.price,
        existingSame,
        input.now
      )
      const withFee = accruePerpPositionTakerFee(
        opened.state,
        opened.position,
        input.fee
      )
      return {
        state: creditPerpPoolFee(withFee.state, input.direction, input.fee),
        payout: null,
      }
    }
    case 'close': {
      const live = state.positions.find(
        (p) =>
          p.userId === input.userId &&
          p.direction === input.direction &&
          p.size > 0
      )
      if (!live)
        throw new Error(
          `shadow has no ${input.direction} row for ${input.userId} to close`
        )
      const closed = closePerpProtectedPosition(
        state,
        live,
        input.price,
        input.fraction,
        input.now
      )
      return { state: closed.state, payout: closed.payout }
    }
    case 'oracle':
      return {
        state: applyPerpProtectedOracleTransition(state, input.price).state,
        payout: null,
      }
    case 'funding':
      return {
        state: applyPerpProtectedFunding(state, input.fundingRate, input.price)
          .state,
        payout: null,
      }
    case 'subsidy':
      if (!Number.isFinite(input.amount) || input.amount <= 0)
        throw new Error('shadow subsidy must be finite and positive')
      return {
        state: {
          pool: {
            L: state.pool.L + (input.side === 'long' ? input.amount : 0),
            S: state.pool.S + (input.side === 'short' ? input.amount : 0),
          },
          positions: state.positions,
        },
        payout: null,
      }
    case 'resolve': {
      // Same shape as the engine: liquidation and claim ADL at the terminal
      // mark, one batch settlement, then the residual leaves the contract
      // (paid to the creator), so the terminal checkpoint is empty pools and
      // no rows — exactly what the engine reports as the live post-state.
      const transitioned = applyPerpProtectedOracleTransition(
        state,
        input.price
      )
      const resolved = resolvePerpProtectedBatch(
        transitioned.state,
        input.price
      )
      return {
        state: { pool: { L: 0, S: 0 }, positions: [] },
        payout: resolved.residual,
      }
    }
  }
}

const invariantsOf = (state: PerpState, price: number) => {
  const summary = summarizePerpInvariants(state, price)
  return { ...summary.long, short: summary.short }
}

const priceOf = (input: PerpShadowTransitionInput, fallback: number) =>
  'price' in input ? input.price : fallback

/**
 * Advance the checkpoint by one live transition and report how the
 * protected-basis path compares with what the legacy ledger committed.
 * Never throws: a failing protected counterpart becomes a divergence and a
 * re-seed, so a shadow evaluation can never take a trade down with it.
 */
export const advancePerpShadowCheckpoint = (
  checkpoint: PerpShadowCheckpoint,
  input: PerpShadowTransitionInput,
  liveAfter: PerpState,
  markPrice: number
): { checkpoint: PerpShadowCheckpoint; report: PerpShadowReport } => {
  const price = priceOf(input, markPrice)
  const before: PerpState = {
    pool: checkpoint.pool,
    positions: checkpoint.positions.map(withReserveBasis),
  }
  let next: PerpState
  let payout: number | null = null
  let error: string | null = null
  let reseeded = false
  try {
    const applied = applyProtectedCounterpart(before, input)
    next = applied.state
    payout = applied.payout
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
    next = mirrored(liveAfter)
    reseeded = true
  }

  const live = mirrored(liveAfter)
  const shadowByKey = new Map(
    next.positions.filter((p) => p.size > 0).map((p) => [key(p), p])
  )
  const liveByKey = new Map(live.positions.map((p) => [key(p), p]))
  const positionDifferences: PerpShadowPositionDifference[] = []
  for (const [k, shadow] of shadowByKey) {
    const liveRow = liveByKey.get(k)
    if (!liveRow) {
      positionDifferences.push({
        userId: shadow.userId,
        direction: shadow.direction,
        sizeDifference: null,
        costBasisDifference: null,
        shadowReserveBasis: getReserveBasis(shadow),
        status: 'shadow-only',
      })
      continue
    }
    const sizeDifference = shadow.size - liveRow.size
    const costBasisDifference = shadow.costBasis - liveRow.costBasis
    if (
      Math.abs(sizeDifference) > perpDustTolerance(shadow.size, liveRow.size) ||
      Math.abs(costBasisDifference) >
        perpDustTolerance(shadow.costBasis, liveRow.costBasis)
    )
      positionDifferences.push({
        userId: shadow.userId,
        direction: shadow.direction,
        sizeDifference,
        costBasisDifference,
        shadowReserveBasis: getReserveBasis(shadow),
        status: 'both',
      })
  }
  for (const [k, liveRow] of liveByKey)
    if (!shadowByKey.has(k))
      positionDifferences.push({
        userId: liveRow.userId,
        direction: liveRow.direction,
        sizeDifference: null,
        costBasisDifference: null,
        shadowReserveBasis: null,
        status: 'live-only',
      })

  const poolDifference = {
    long: next.pool.L - live.pool.L,
    short: next.pool.S - live.pool.S,
  }
  const snapshot = getPerpAccountingSnapshot(next, price)
  const livePayout =
    input.kind === 'close'
      ? input.livePayout
      : input.kind === 'resolve'
      ? input.liveResidual
      : undefined
  const payoutDifference =
    payout !== null && livePayout !== undefined ? payout - livePayout : null
  const divergent =
    error !== null ||
    positionDifferences.length > 0 ||
    Math.abs(poolDifference.long) >
      perpDustTolerance(next.pool.L, live.pool.L) ||
    Math.abs(poolDifference.short) >
      perpDustTolerance(next.pool.S, live.pool.S) ||
    (payoutDifference !== null &&
      Math.abs(payoutDifference) >
        perpDustTolerance(payout ?? 0, livePayout ?? 0))

  const report: PerpShadowReport = {
    kind: input.kind,
    applied: error === null,
    error,
    reseeded,
    poolDifference,
    positionDifferences,
    basisDeficit: snapshot.long.basisDeficit + snapshot.short.basisDeficit,
    reducedBasisCount:
      snapshot.long.reducedBasisCount + snapshot.short.reducedBasisCount,
    shadowInvariants: invariantsOf(next, price),
    liveInvariants: invariantsOf(live, price),
    payoutDifference,
    divergent,
  }
  return {
    checkpoint: {
      epoch: checkpoint.epoch,
      pool: next.pool,
      positions: next.positions.filter((p) => p.size > 0),
      transitions: checkpoint.transitions + 1,
      divergences: checkpoint.divergences + (divergent ? 1 : 0),
      reseeds: checkpoint.reseeds + (reseeded ? 1 : 0),
    },
    report,
  }
}

/** Parse a persisted checkpoint; anything malformed yields null (re-seed). */
export const parsePerpShadowCheckpoint = (
  value: unknown,
  epoch: number
): PerpShadowCheckpoint | null => {
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Record<string, unknown>
  const pool = raw.pool as Record<string, unknown> | undefined
  if (
    !pool ||
    typeof pool.L !== 'number' ||
    typeof pool.S !== 'number' ||
    !Number.isFinite(pool.L) ||
    !Number.isFinite(pool.S) ||
    !Array.isArray(raw.positions)
  )
    return null
  const positions: PerpPosition[] = []
  for (const row of raw.positions as unknown[]) {
    if (typeof row !== 'object' || row === null) return null
    const p = row as Record<string, unknown>
    const numbers = [
      p.size,
      p.costBasis,
      p.reserveBasis,
      p.originalCostBasis,
      p.entryPrice,
      p.leverage,
      p.liquidationPrice,
      p.openedTime,
      p.updatedTime,
    ]
    if (
      typeof p.userId !== 'string' ||
      typeof p.contractId !== 'string' ||
      (p.direction !== 'long' && p.direction !== 'short') ||
      numbers.some((n) => typeof n !== 'number' || !Number.isFinite(n))
    )
      return null
    positions.push({
      userId: p.userId,
      contractId: p.contractId,
      direction: p.direction,
      size: p.size as number,
      costBasis: p.costBasis as number,
      reserveBasis: p.reserveBasis as number,
      originalCostBasis: p.originalCostBasis as number,
      takerFeeCostBasis:
        typeof p.takerFeeCostBasis === 'number' &&
        Number.isFinite(p.takerFeeCostBasis)
          ? p.takerFeeCostBasis
          : 0,
      entryPrice: p.entryPrice as number,
      leverage: p.leverage as number,
      liquidationPrice: p.liquidationPrice as number,
      openedTime: p.openedTime as number,
      updatedTime: p.updatedTime as number,
    })
  }
  const counters = (name: string) =>
    typeof raw[name] === 'number' && Number.isFinite(raw[name])
      ? (raw[name] as number)
      : 0
  return {
    epoch,
    pool: { L: pool.L, S: pool.S },
    positions,
    transitions: counters('transitions'),
    divergences: counters('divergences'),
    reseeds: counters('reseeds'),
  }
}
