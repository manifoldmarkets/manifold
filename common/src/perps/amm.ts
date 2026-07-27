// Pure AMM math for ManiPerp (paper §2).
// NO I/O. Every function takes a { pool, positions } snapshot and returns a
// new snapshot. Caller (engine.ts) persists deltas.

import { PerpDirection, PerpPosition } from './position'

export type PerpPool = {
  L: number
  S: number
}

export type PerpState = {
  pool: PerpPool
  positions: PerpPosition[]
}

export type AdlSettlement = {
  /** Position immediately before the factor-zero ADL. */
  position: PerpPosition
  /** Remaining margin returned to the user from the position's own pool. */
  payout: number
}

/** Current mana available across both sides to back position payouts. */
export const getPerpBackingPool = (poolLong: number, poolShort: number) => {
  if (
    !Number.isFinite(poolLong) ||
    !Number.isFinite(poolShort) ||
    poolLong < 0 ||
    poolShort < 0
  ) {
    return 0
  }
  const total = poolLong + poolShort
  return Number.isFinite(total) ? total : 0
}

/**
 * Floating-point subtraction can leave a pool a few ulps below zero after a
 * fully-backed payout. Clamp only that representational dust; a material
 * deficit remains negative so the engine's solvency checks still fail closed.
 */
const poolAfterDebit = (pool: number, debit: number) => {
  const next = pool - debit
  if (next >= 0) return next === 0 ? 0 : next

  const scale = Math.max(1, Math.abs(pool), Math.abs(debit))
  // The absolute cap prevents a huge corrupted pool from turning a
  // scale-relative tolerance into a meaningful amount of mana.
  const tolerance = Math.min(1e-6, 128 * Number.EPSILON * scale)
  return next >= -tolerance ? 0 : next
}

// -------- core position math --------

export const getLeverage = (size: number, costBasis: number) =>
  costBasis > 0 ? size / costBasis : 0

/**
 * Liquidation price (paper eq. 1):
 *   long:  P_liq = (1 - 1/ℓ) · P_e
 *   short: P_liq = (1 + 1/ℓ) · P_e
 */
export const liquidationPrice = (
  direction: PerpDirection,
  entryPrice: number,
  leverage: number
) => {
  if (leverage <= 0) return direction === 'long' ? 0 : Infinity
  return direction === 'long'
    ? (1 - 1 / leverage) * entryPrice
    : (1 + 1 / leverage) * entryPrice
}

/**
 * Unrealized equity π (paper eq. 13) for any direction.
 *   long:  π = (P - P_e) / P_e · q
 *   short: π = (P_e - P) / P_e · q
 */
export const getUnrealizedEquity = (position: PerpPosition, price: number) => {
  if (position.size <= 0 || position.entryPrice <= 0) return 0
  const { entryPrice, size, direction } = position
  return direction === 'long'
    ? ((price - entryPrice) / entryPrice) * size
    : ((entryPrice - price) / entryPrice) * size
}

/** Current value of an open position (c + π), floored at 0. */
export const getPositionValue = (position: PerpPosition, price: number) =>
  Math.max(position.costBasis + getUnrealizedEquity(position, price), 0)

// -------- funding --------

/**
 * Imbalance function I(r) (paper eq. 4).
 * Defined for r >= 1; caller should swap pools when S > L and negate sign.
 *
 *   I(r) = (r - 1) / (r - 1 + k)
 */
export const imbalance = (r: number, k: number) => {
  if (!(k > 0)) return 0
  if (r <= 1) return 0
  return (r - 1) / (r - 1 + k)
}

/**
 * Funding rate for the period.
 *   +ve means longs pay shorts (L > S); -ve means shorts pay longs (S > L).
 */
export const computeFundingRate = (
  L: number,
  S: number,
  k: number,
  fMax: number
) => {
  // Keep this display/shared helper total: the engine separately rejects an
  // invalid contract configuration before applying funding. Returning zero
  // here prevents corrupt legacy data from turning a React render into NaN.
  if (
    !Number.isFinite(L) ||
    !Number.isFinite(S) ||
    !Number.isFinite(k) ||
    !Number.isFinite(fMax) ||
    k <= 0 ||
    fMax <= 0
  )
    return 0
  if (L <= 0 || S <= 0) return 0
  if (L === S) return 0

  // Algebraically equivalent to imbalance(high / low, k), but normalizing
  // low by high avoids an overflowing high / low ratio for extreme yet valid
  // finite pools:
  //   (r - 1) / (r - 1 + k)
  //   = (1 - low/high) / (1 - low/high + k * low/high)
  const high = Math.max(L, S)
  const low = Math.min(L, S)
  const lowOverHigh = low / high
  const gap = 1 - lowOverHigh
  const denominator = gap + k * lowOverHigh
  const fraction = denominator > 0 ? gap / denominator : 0
  const magnitude = fraction * fMax
  if (!Number.isFinite(magnitude) || magnitude === 0) return 0
  return L > S ? magnitude : -magnitude
}

/**
 * Runtime guard for persisted contract economics.
 *
 * New contracts are schema-validated, but old rows bypass that schema. A
 * funding cap of 1 could erase the paying side in one tick, creating
 * zero-margin positions and an unpayable transition. Fail closed instead of
 * silently clamping and changing the contract's stated economics.
 */
export const assertPerpFundingConfig = (config: {
  fundingSensitivity: number
  maxFundingRate: number
}) => {
  const { fundingSensitivity, maxFundingRate } = config
  if (!Number.isFinite(fundingSensitivity) || fundingSensitivity <= 0)
    throw new Error('funding sensitivity must be finite and positive')
  if (
    !Number.isFinite(maxFundingRate) ||
    maxFundingRate <= 0 ||
    maxFundingRate >= 1
  )
    throw new Error('max funding rate must be finite and in (0, 1)')
}

/**
 * Apply a funding event (paper §2.3, eq. 5–9).
 * Pure: returns new pool and updated position list.
 */
export const applyFunding = (state: PerpState, fundingRate: number) => {
  const { L, S } = state.pool
  if (fundingRate === 0 || L <= 0 || S <= 0) return state

  let newL = L
  let newS = S
  let f = 0 // scaling applied to dominant side (haircut)
  let g = 0 // scaling applied to minority side (bonus)
  let dominant: PerpDirection

  if (fundingRate > 0) {
    // Longs pay shorts.
    dominant = 'long'
    f = fundingRate
    const delta = f * L
    newL = (1 - f) * L
    newS = S + delta
    g = delta / S
  } else {
    // Shorts pay longs.
    dominant = 'short'
    f = -fundingRate
    const delta = f * S
    newS = (1 - f) * S
    newL = L + delta
    g = delta / L
  }

  const newPositions = state.positions.map((p) => {
    if (p.size <= 0) return p
    if (p.direction === dominant) {
      // Haircut.
      const size = (1 - f) * p.size
      const costBasis = (1 - f) * p.costBasis
      const leverage = getLeverage(size, costBasis)
      return {
        ...p,
        size,
        costBasis,
        leverage,
        liquidationPrice: liquidationPrice(p.direction, p.entryPrice, leverage),
      }
    }
    // Minority: scale up.
    const size = (1 + g) * p.size
    const costBasis = (1 + g) * p.costBasis
    const leverage = getLeverage(size, costBasis)
    return {
      ...p,
      size,
      costBasis,
      leverage,
      liquidationPrice: liquidationPrice(p.direction, p.entryPrice, leverage),
    }
  })

  return { pool: { L: newL, S: newS }, positions: newPositions }
}

// -------- liquidation & ADL --------

export const isLiquidated = (position: PerpPosition, price: number) => {
  if (position.size <= 0 || position.leverage <= 0) return false
  return position.direction === 'long'
    ? price <= position.liquidationPrice
    : price >= position.liquidationPrice
}

/**
 * Process liquidations at oracle price P (paper §2.4, eq. 10).
 * Liquidated positions have their size and cost basis zeroed; margin stays in
 * the pool (L unchanged). Returns new state + list of liquidated positions.
 */
export const processLiquidations = (state: PerpState, price: number) => {
  const liquidated: PerpPosition[] = []
  const positions = state.positions.map((p) => {
    if (!isLiquidated(p, price)) return p
    liquidated.push(p)
    return {
      ...p,
      size: 0,
      costBasis: 0,
      leverage: 0,
    }
  })
  return { state: { pool: state.pool, positions }, liquidated }
}

/**
 * Auto-deleverage (paper §2.4, eq. 11–12).
 * Only profitable positions are scaled down; cost basis unchanged.
 */
export const applyADL = (state: PerpState, price: number) => {
  const { L, S } = state.pool
  const longs = state.positions.filter(
    (p) => p.direction === 'long' && p.size > 0
  )
  const shorts = state.positions.filter(
    (p) => p.direction === 'short' && p.size > 0
  )

  const profit = (p: PerpPosition) => getUnrealizedEquity(p, price)

  const EL = longs
    .filter((p) => profit(p) > 0)
    .reduce((s, p) => s + profit(p), 0)
  const ES = shorts
    .filter((p) => profit(p) > 0)
    .reduce((s, p) => s + profit(p), 0)

  const CS = shorts.reduce(
    (s, p) => s + Math.min(p.costBasis, getPositionValue(p, price)),
    0
  )
  const CL = longs.reduce(
    (s, p) => s + Math.min(p.costBasis, getPositionValue(p, price)),
    0
  )

  const sL = EL > 0 ? (S - CS) / EL : 1
  const sS = ES > 0 ? (L - CL) / ES : 1

  const adlFactorLong = sL < 1 ? Math.max(sL, 0) : 1
  const adlFactorShort = sS < 1 ? Math.max(sS, 0) : 1

  const settled: AdlSettlement[] = []
  const positions = state.positions
    .map((p) => {
      if (p.size <= 0) return p
      const π = profit(p)
      const factor = p.direction === 'long' ? adlFactorLong : adlFactorShort

      // A zero ADL factor extinguishes all future exposure but must not
      // extinguish the user's retained margin. Settle that margin from the
      // position's own pool and remove the position explicitly; engine
      // callers mirror the pool debit with a user payout transaction.
      if (factor === 0 && π > 0) {
        settled.push({ position: p, payout: p.costBasis })
        return null
      }

      if (p.direction === 'long' && sL < 1 && π > 0) {
        const size = adlFactorLong * p.size
        const leverage = getLeverage(size, p.costBasis)
        return {
          ...p,
          size,
          leverage,
          liquidationPrice: liquidationPrice('long', p.entryPrice, leverage),
        }
      }
      if (p.direction === 'short' && sS < 1 && π > 0) {
        const size = adlFactorShort * p.size
        const leverage = getLeverage(size, p.costBasis)
        return {
          ...p,
          size,
          leverage,
          liquidationPrice: liquidationPrice('short', p.entryPrice, leverage),
        }
      }
      return p
    })
    .filter((p): p is PerpPosition => p != null)

  const longSettlementPayout = settled
    .filter((s) => s.position.direction === 'long')
    .reduce((sum, s) => sum + s.payout, 0)
  const shortSettlementPayout = settled
    .filter((s) => s.position.direction === 'short')
    .reduce((sum, s) => sum + s.payout, 0)

  return {
    state: {
      pool: {
        L: poolAfterDebit(L, longSettlementPayout),
        S: poolAfterDebit(S, shortSettlementPayout),
      },
      positions,
    },
    adlFactorLong,
    adlFactorShort,
    settled,
  }
}

// -------- open / close --------

export type OpenResult = {
  state: PerpState
  position: PerpPosition
  deltaSize: number
  deltaCostBasis: number
  deltaOriginalCostBasis: number
}

/**
 * Open or add to a position (paper §2.2, eq. 3).
 * If `existing` is provided, we size-weighted-average the entry price.
 * Caller must enforce one-way mode before calling this.
 */
export const openPosition = (
  state: PerpState,
  userId: string,
  contractId: string,
  direction: PerpDirection,
  mana: number,
  leverage: number,
  oraclePrice: number,
  existing?: PerpPosition,
  now = Date.now()
): OpenResult => {
  const newSize = mana * leverage
  const newCostBasis = mana
  const L = state.pool.L + (direction === 'long' ? mana : 0)
  const S = state.pool.S + (direction === 'short' ? mana : 0)

  let nextPosition: PerpPosition
  if (existing && existing.size > 0) {
    const totalSize = existing.size + newSize
    const entryPrice =
      (existing.entryPrice * existing.size + oraclePrice * newSize) / totalSize
    const costBasis = existing.costBasis + newCostBasis
    const lev = getLeverage(totalSize, costBasis)
    nextPosition = {
      userId,
      contractId,
      direction,
      size: totalSize,
      costBasis,
      originalCostBasis: existing.originalCostBasis + mana,
      entryPrice,
      leverage: lev,
      liquidationPrice: liquidationPrice(direction, entryPrice, lev),
      openedTime: existing.openedTime,
      updatedTime: now,
    }
  } else {
    nextPosition = {
      userId,
      contractId,
      direction,
      size: newSize,
      costBasis: newCostBasis,
      originalCostBasis: mana,
      entryPrice: oraclePrice,
      leverage,
      liquidationPrice: liquidationPrice(direction, oraclePrice, leverage),
      openedTime: now,
      updatedTime: now,
    }
  }

  const newPositions = [
    ...state.positions.filter(
      (p) => !(p.userId === userId && p.direction === direction)
    ),
    nextPosition,
  ]

  return {
    state: { pool: { L, S }, positions: newPositions },
    position: nextPosition,
    deltaSize: newSize,
    deltaCostBasis: newCostBasis,
    deltaOriginalCostBasis: mana,
  }
}

export type CloseResult = {
  state: PerpState
  payout: number // mana paid to user
  pnl: number // π at close
  poolLongDelta: number
  poolShortDelta: number
}

/**
 * Close a long or short position at the oracle price (paper §2.5, eq. 13–15).
 * Solvency invariant guarantees the opposing pool can cover π > 0.
 */
export const closePosition = (
  state: PerpState,
  position: PerpPosition,
  price: number
): CloseResult => {
  const π = getUnrealizedEquity(position, price)
  let poolLongDelta = 0
  let poolShortDelta = 0
  let payout = 0

  if (π <= 0) {
    payout = Math.max(position.costBasis + π, 0)
    if (position.direction === 'long') poolLongDelta = -payout
    else poolShortDelta = -payout
  } else {
    payout = position.costBasis + π
    if (position.direction === 'long') {
      poolLongDelta = -position.costBasis
      poolShortDelta = -π
    } else {
      poolShortDelta = -position.costBasis
      poolLongDelta = -π
    }
  }

  const positions = state.positions.filter(
    (p) => !(p.userId === position.userId && p.direction === position.direction)
  )

  return {
    state: {
      pool: {
        L:
          poolLongDelta < 0
            ? poolAfterDebit(state.pool.L, -poolLongDelta)
            : state.pool.L + poolLongDelta,
        S:
          poolShortDelta < 0
            ? poolAfterDebit(state.pool.S, -poolShortDelta)
            : state.pool.S + poolShortDelta,
      },
      positions,
    },
    payout,
    pnl: π,
    poolLongDelta,
    poolShortDelta,
  }
}

// -------- solvency --------

/**
 * Solvency factor for a side (>= 1 means fully solvent). Used to refuse opens
 * that would immediately require ADL.
 */
export const solvencyFactor = (
  side: PerpDirection,
  state: PerpState,
  price: number
) => {
  const { L, S } = state.pool
  const opposing = side === 'long' ? S : L
  const oppositePositions = state.positions.filter(
    (p) => p.direction === (side === 'long' ? 'short' : 'long') && p.size > 0
  )
  const C = oppositePositions.reduce(
    (s, p) => s + Math.min(p.costBasis, getPositionValue(p, price)),
    0
  )
  const E = state.positions
    .filter((p) => p.direction === side && p.size > 0)
    .reduce((s, p) => s + Math.max(getUnrealizedEquity(p, price), 0), 0)
  const availableCover = opposing - C
  if (E <= 0) return availableCover >= 0 ? Infinity : -Infinity
  return availableCover / E
}

/**
 * Relative tolerance for the post-correction solvency ratio. ADL targets
 * exactly 1, so a small allowance is needed for floating-point division.
 */
export const PERP_SOLVENCY_FACTOR_TOLERANCE = 1e-12

const assertFiniteNumber = (label: string, value: number) => {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`)
}

const assertPerpStateNumbers = (state: PerpState, price: number) => {
  assertFiniteNumber('oracle price', price)
  if (price <= 0) throw new Error('oracle price must be positive')

  const { L, S } = state.pool
  assertFiniteNumber('long pool', L)
  assertFiniteNumber('short pool', S)
  if (L < 0 || S < 0) throw new Error('perp pools must be non-negative')
  assertFiniteNumber('total pool', L + S)

  state.positions.forEach((position, index) => {
    const prefix = `position ${index}`
    assertFiniteNumber(`${prefix} size`, position.size)
    assertFiniteNumber(`${prefix} cost basis`, position.costBasis)
    assertFiniteNumber(
      `${prefix} original cost basis`,
      position.originalCostBasis
    )
    assertFiniteNumber(`${prefix} entry price`, position.entryPrice)
    assertFiniteNumber(`${prefix} leverage`, position.leverage)
    assertFiniteNumber(`${prefix} liquidation price`, position.liquidationPrice)
    assertFiniteNumber(`${prefix} opened time`, position.openedTime)
    assertFiniteNumber(`${prefix} updated time`, position.updatedTime)

    if (
      position.size < 0 ||
      position.costBasis < 0 ||
      position.originalCostBasis < 0
    )
      throw new Error(`${prefix} amounts must be non-negative`)
    if (position.entryPrice <= 0)
      throw new Error(`${prefix} entry price must be positive`)

    if (position.size === 0) {
      if (position.costBasis !== 0 || position.leverage !== 0)
        throw new Error(`${prefix} has margin without active exposure`)
    } else if (position.costBasis <= 0 || position.leverage <= 0) {
      throw new Error(`${prefix} active exposure must have positive margin`)
    }
  })
}

/**
 * Fail closed before a PERP state is persisted or used for payouts.
 *
 * Positive Infinity is the valid no-profit case. Negative Infinity means the
 * opposing pool cannot even reserve the other side's current position values.
 */
export const assertPerpStateSolvent = (
  state: PerpState,
  price: number,
  tolerance = PERP_SOLVENCY_FACTOR_TOLERANCE
) => {
  if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance >= 1)
    throw new Error('solvency tolerance must be finite and in [0, 1)')

  assertPerpStateNumbers(state, price)

  for (const side of ['long', 'short'] as const) {
    const factor = solvencyFactor(side, state, price)
    if (factor === Infinity) continue
    if (!Number.isFinite(factor))
      throw new Error(`${side} solvency factor must be finite or +Infinity`)
    if (factor < 1 - tolerance)
      throw new Error(
        `${side} solvency factor ${factor} is below ${1 - tolerance}`
      )
  }
}

/**
 * Immediate funding-safety containment.
 *
 * Funding can increase a receiving side's existing mark-to-market profit.
 * Re-run ADL at the unchanged oracle price, then validate the corrected state
 * before the caller builds any persistence queries.
 *
 * A factor-zero ADL explicitly settles the position's retained cost basis
 * from its own pool. Callers must mirror each returned settlement with the
 * corresponding user payout before persisting the reduced pool.
 */
export const applyFundingWithSolvency = (
  state: PerpState,
  fundingRate: number,
  price: number
) => {
  assertFiniteNumber('funding rate', fundingRate)
  if (Math.abs(fundingRate) >= 1)
    throw new Error('absolute funding rate must be below 1')
  // Funding must not silently repair and misattribute an insolvency left by
  // an earlier oracle transition. Its input is expected to be the fully
  // liquidated/ADL-corrected state from the immediately preceding tick.
  assertPerpStateSolvent(state, price)

  const funded = applyFunding(state, fundingRate)
  assertPerpStateNumbers(funded, price)

  const corrected = applyADL(funded, price)

  if (
    !Number.isFinite(corrected.adlFactorLong) ||
    !Number.isFinite(corrected.adlFactorShort)
  )
    throw new Error('funding ADL factors must be finite')

  assertPerpStateSolvent(corrected.state, price)
  return { ...corrected, fundedState: funded }
}
