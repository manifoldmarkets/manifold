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
  if (L <= 0 || S <= 0) return 0
  if (L === S) return 0
  if (L > S) return imbalance(L / S, k) * fMax
  return -imbalance(S / L, k) * fMax
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
  const longs = state.positions.filter((p) => p.direction === 'long' && p.size > 0)
  const shorts = state.positions.filter((p) => p.direction === 'short' && p.size > 0)

  const profit = (p: PerpPosition) => getUnrealizedEquity(p, price)

  const EL = longs.filter((p) => profit(p) > 0).reduce((s, p) => s + profit(p), 0)
  const ES = shorts
    .filter((p) => profit(p) > 0)
    .reduce((s, p) => s + profit(p), 0)

  const CS = shorts.reduce((s, p) => s + Math.min(p.costBasis, getPositionValue(p, price)), 0)
  const CL = longs.reduce((s, p) => s + Math.min(p.costBasis, getPositionValue(p, price)), 0)

  const sL = EL > 0 ? (S - CS) / EL : 1
  const sS = ES > 0 ? (L - CL) / ES : 1

  const adlFactorLong = sL < 1 ? Math.max(sL, 0) : 1
  const adlFactorShort = sS < 1 ? Math.max(sS, 0) : 1

  const positions = state.positions.map((p) => {
    if (p.size <= 0) return p
    const π = profit(p)
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

  return {
    state: { pool: state.pool, positions },
    adlFactorLong,
    adlFactorShort,
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
        L: state.pool.L + poolLongDelta,
        S: state.pool.S + poolShortDelta,
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
  if (E <= 0) return Infinity
  return (opposing - C) / E
}
