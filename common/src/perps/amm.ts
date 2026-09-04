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
 * Floor for the leverage a trade request may ask for. The UI never offers
 * sub-1× leverage, and as ℓ → 0 the 1/ℓ term in the liquidation-price
 * formula overflows float64 to ±Infinity, which the state validators
 * (correctly) refuse. Existing positions can still drift below 1× through
 * ADL haircuts — this floor applies to requested leverage only.
 */
export const MIN_PERP_LEVERAGE = 1

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

/**
 * Entry price of two tranches collapsed into one position, such that the
 * merged position's equity equals the sum of the tranches' equities at every
 * price (see the note on `openPosition`).
 *
 * Because π is linear in the unit count q/Pe, that means adding units:
 *   (q₁ + q₂) / Pe = q₁/Pe₁ + q₂/Pe₂
 * i.e. the units-weighted harmonic mean. Always lies between Pe₁ and Pe₂.
 */
export const mergedEntryPrice = (
  size1: number,
  entryPrice1: number,
  size2: number,
  entryPrice2: number
) => {
  const units = size1 / entryPrice1 + size2 / entryPrice2
  return (size1 + size2) / units
}

/**
 * Inverse of `mergedEntryPrice`: given the merged position and the tranche
 * that was just added, recover the entry price the position had before.
 * Used by period-metric reconstruction to replay `add` events backwards.
 *
 * Returns undefined when the inputs cannot describe a real merge (the unit
 * count of the prior tranche must be strictly positive).
 */
export const unmergeEntryPrice = (
  sizeBefore: number,
  sizeAfter: number,
  entryPriceAfter: number,
  sizeAdded: number,
  addedPrice: number
) => {
  const unitsBefore = sizeAfter / entryPriceAfter - sizeAdded / addedPrice
  if (!(unitsBefore > 0)) return undefined
  const entryPrice = sizeBefore / unitsBefore
  return Number.isFinite(entryPrice) && entryPrice > 0 ? entryPrice : undefined
}

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
 * Aggregate open notional per side — the exposure actually at risk.
 *
 * This is NOT interchangeable with the backing pools. A pool holds margin,
 * so pool ratio only tracks exposure ratio when both sides run comparable
 * leverage. Where they don't, the two can disagree in SIGN: on 2026-08-08
 * the BTC market held 454k long vs 348k short of notional (1.30 long-heavy)
 * on pools of 59.6k long vs 83.0k short (0.72 — reading short-heavy), so
 * pool-driven funding paid the crowded side and charged the scarce one.
 */
export const getPerpOpenInterest = (positions: PerpPosition[]) => {
  let long = 0
  let short = 0
  for (const p of positions) {
    if (!Number.isFinite(p.size) || p.size <= 0) continue
    if (p.direction === 'long') long += p.size
    else short += p.size
  }
  return {
    long: Number.isFinite(long) ? long : 0,
    short: Number.isFinite(short) ? short : 0,
  }
}

/**
 * Funding rate for the period, from the two sides' OPEN INTEREST (notional).
 *
 *   +ve means longs pay shorts (longs crowded);
 *   -ve means shorts pay longs (shorts crowded).
 *
 * Pass `getPerpOpenInterest(...)`, never the backing pools — see that
 * function for why the two disagree. The parameters are deliberately named
 * for the quantity rather than L/S: those names are what invited the pools
 * in the first place.
 *
 * A side with zero open interest yields a rate of zero: funding transfers
 * between the two sides' positions, so with nobody on one side there is no
 * counterparty to receive it. Inducing entry onto an empty side needs a
 * mechanism that pays from somewhere other than the absent side, which is
 * out of scope here.
 */
export const computeFundingRate = (
  openInterestLong: number,
  openInterestShort: number,
  k: number,
  fMax: number
) => {
  // Keep this display/shared helper total: the engine separately rejects an
  // invalid contract configuration before applying funding. Returning zero
  // here prevents corrupt legacy data from turning a React render into NaN.
  if (
    !Number.isFinite(openInterestLong) ||
    !Number.isFinite(openInterestShort) ||
    !Number.isFinite(k) ||
    !Number.isFinite(fMax) ||
    k <= 0 ||
    fMax <= 0
  )
    return 0
  if (openInterestLong <= 0 || openInterestShort <= 0) return 0
  if (openInterestLong === openInterestShort) return 0

  // Algebraically equivalent to imbalance(high / low, k), but normalizing
  // low by high avoids an overflowing high / low ratio for extreme yet valid
  // finite inputs:
  //   (r - 1) / (r - 1 + k)
  //   = (1 - low/high) / (1 - low/high + k * low/high)
  const high = Math.max(openInterestLong, openInterestShort)
  const low = Math.min(openInterestLong, openInterestShort)
  const lowOverHigh = low / high
  const gap = 1 - lowOverHigh
  const denominator = gap + k * lowOverHigh
  const fraction = denominator > 0 ? gap / denominator : 0
  const magnitude = fraction * fMax
  if (!Number.isFinite(magnitude) || magnitude === 0) return 0
  return openInterestLong > openInterestShort ? magnitude : -magnitude
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

  // Cross-side deficit transfer. Margin refunds are senior to unrealized
  // profits, and the two pools sit behind ONE escrow balance.
  //
  // A side's pool can fall below that side's own refundable margin when
  // realized profits were paid to the opposing side against unrealized
  // losses that later recovered (UK carbon 2026-08-07, and the OpenRouter
  // open-weight share market 2026-08-29). ADL alone cannot repair that
  // state: it scales profits and never cost bases, so the factor clamps to
  // 0, every winner is settled and removed, and the deficit is still there
  // with no profit left to scale against. assertPerpStateSolvent then sees
  // -Infinity and the oracle apply fail-closes — forever, at a stale price.
  //
  // assertPerpEscrowBalance checks L + S against one contract balance, so
  // the L/S split is an accounting convention rather than a custody
  // boundary. Before pricing ADL, if one side is short of its own reserve and
  // the other holds at least that much above its reserve, move the deficit
  // across. At most one direction is non-zero — a side in deficit has no
  // surplus by construction. Total escrow is unchanged and no user balance
  // moves. A book that was already covered transfers exactly zero, so this is
  // inert on every market that was not wedged.
  //
  // All-or-nothing on purpose. A partial transfer cannot make the book
  // representable — the recipient's cover is still negative afterwards, so the
  // assert throws either way — but it DOES change the ADL factors on the way
  // there, and a donor drained to exactly zero pushes the opposing factor to 0,
  // which settles that side and overdraws its pool. Transferring only when the
  // donor fully covers the deficit means this can turn a throw into a success
  // and can never reshape a path that was going to throw regardless.
  const surplusL = L - CL
  const surplusS = S - CS
  const transferToL = surplusL < 0 && surplusS >= -surplusL ? -surplusL : 0
  const transferToS = surplusS < 0 && surplusL >= -surplusS ? -surplusS : 0
  /** Positive = moved S -> L, negative = moved L -> S. */
  const crossSideTransfer = transferToL - transferToS
  // Assign the RECIPIENT its reserve exactly rather than computing
  // `L + (CL - L)`, which is not exactly CL in float and can leave cover one
  // ULP negative. That is not a rounding nuisance here: the -Infinity branch of
  // solvencyFactor has no tolerance, so a single ULP of negative cover on a
  // side with no profit left is the difference between unwedging and staying
  // wedged. The donor absorbs the same value, so escrow moves by at most one
  // ULP, which assertPerpEscrowBalance tolerates.
  const adjustedL = transferToL > 0 ? CL : L - transferToS
  const adjustedS = transferToS > 0 ? CS : S - transferToL

  const sL = EL > 0 ? (adjustedS - CS) / EL : 1
  const sS = ES > 0 ? (adjustedL - CL) / ES : 1

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
        L: poolAfterDebit(adjustedL, longSettlementPayout),
        S: poolAfterDebit(adjustedS, shortSettlementPayout),
      },
      positions,
    },
    adlFactorLong,
    adlFactorShort,
    settled,
    crossSideTransfer,
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
 *
 * The paper keeps every tranche separate (`P' = P ∪ [(d, m·ℓ, m, P)]`). We
 * collapse them into one row per (user, direction), so the merged entry
 * price has to be chosen such that the collapsed position has exactly the
 * same equity as the two tranches would have had.
 *
 * Equity (eq. 13) is π = ±(P − Pe)/Pe · q, where q is mana-NOTIONAL, so the
 * underlying unit count is q/Pe. Merging conserves value only if the units
 * add up: q/Pe = q₁/Pe₁ + q₂/Pe₂, i.e. the merged entry price is the
 * units-weighted HARMONIC mean, not the arithmetic one.
 *
 * Using the arithmetic mean here silently mints equity for shorts and burns
 * it for longs on every add — by q₁·q₂·(1−r)²/(q₁ + r·q₂) with
 * r = P_add/Pe₁, paid out of the opposing pool. See the value-conservation
 * tests in amm.test.ts.
 *
 * `metric-periods.ts` reverses this exact formula to reconstruct historical
 * positions. The two must change together.
 *
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
    const entryPrice = mergedEntryPrice(
      existing.size,
      existing.entryPrice,
      newSize,
      oraclePrice
    )
    const costBasis = existing.costBasis + newCostBasis
    const lev = getLeverage(totalSize, costBasis)
    nextPosition = {
      userId,
      contractId,
      direction,
      size: totalSize,
      costBasis,
      originalCostBasis: existing.originalCostBasis + mana,
      takerFeeCostBasis: existing.takerFeeCostBasis ?? 0,
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
      takerFeeCostBasis: 0,
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
 * Launch guardrail beyond the ManiPerp paper: aggregate exposure on either
 * side may not exceed this multiple of the backing the opposing side provides.
 *
 * This still permits high leverage for small positions, while preventing a
 * freshly opened position (which has no unrealized profit yet) from creating
 * effectively unlimited future claims against a finite pool.
 *
 * Read it as an adverse move of 1/M where M is this multiple: the cap is sized
 * so this side's profit over a 10% move still fits the backing available for
 * it. See `calculateMatchedCredit` for the derivation.
 */
export const PERP_OPEN_INTEREST_COVER_MULTIPLE = 10

export type PerpOpenInterestCapacity = {
  openInterest: number
  availableCover: number
  /** Notional the opposing book funds out of its own losses. */
  matchedCredit: number
  limit: number
  headroom: number
  isWithinLimit: boolean
}

export const isPerpOpenInterestWithinLimit = (
  openInterest: number,
  limit: number
) => {
  assertFiniteNumber('open interest', openInterest)
  assertFiniteNumber('open interest limit', limit)
  if (openInterest < 0 || limit < 0)
    throw new Error('open interest and limit must be non-negative')

  // Accommodate only arithmetic dust at the exact boundary. The absolute cap
  // keeps a very large market from gaining meaningful capacity via tolerance.
  const tolerance = Math.min(
    0.001,
    128 * Number.EPSILON * Math.max(1, Math.abs(openInterest), Math.abs(limit))
  )
  return openInterest <= limit + tolerance
}

const calculateAvailableCover = (
  side: PerpDirection,
  state: PerpState,
  price: number
) => {
  const opposingPool = side === 'long' ? state.pool.S : state.pool.L
  const oppositeDirection = side === 'long' ? 'short' : 'long'
  const reservedOpposingValue = state.positions
    .filter((p) => p.direction === oppositeDirection && p.size > 0)
    .reduce(
      (sum, p) => sum + Math.min(p.costBasis, getPositionValue(p, price)),
      0
    )
  return opposingPool - reservedOpposingValue
}

/**
 * Notional the OPPOSING book can fund out of its own losses.
 *
 * The cap exists to bound the drain on the opposing pool from this side's
 * profits over an adverse move of x = 1 / PERP_OPEN_INTEREST_COVER_MULTIPLE.
 * Over such a move:
 *
 *   this side's profit ≈ x · OI(side)
 *   released           = R(opp, P) − R(opp, P'), the opposing reserve that
 *                        actually stops being reserved as the move goes
 *                        against them — and it is released INTO the very pool
 *                        that pays this side.
 *   net drain          ≈ x · OI(side) − released
 *
 * Requiring `net drain ≤ availableCover` and multiplying through by the
 * multiple M = 1/x gives
 *
 *   OI(side) ≤ M · availableCover + M · released
 *
 * and the second term is this credit.
 *
 * ⚠️ `released` must be evaluated at BOTH prices. R is
 * `min(costBasis, positionValue)`, which is FLAT in price wherever the
 * opposing position is in profit — value exceeds cost basis, the `min` clamps
 * to cost basis, and an adverse move releases nothing at all. Crediting
 * `M · R(opp, P)` instead (the first version of this) hands out capacity
 * against margin that the move never frees: mark 100, a short of size 1000 at
 * entry 200 with 100 of basis against a 100 short pool reserves its whole 100,
 * so the naive form credits 1000 of long notional — and at mark 110 that short
 * is still deeply profitable, still reserves the entire pool, and the new long
 * has zero cover and is factor-zero ADL'd on its first profitable tick.
 *
 * Because R is non-increasing over an adverse move and can fall by at most the
 * position's own loss, `released ≤ x · OI(opp)`, so `M · released ≤ OI(opp)`;
 * the explicit `min` against opposing OI below is therefore belt-and-braces
 * against float, not the binding constraint. And since `released ≤ R(opp, P)`,
 * the two terms telescope wherever cover is non-negative:
 *
 *   M · (pool − R) + M · released  ≤  M · pool
 *
 * so the cap can never promise more than the whole opposing pool over the move
 * it is sized for.
 *
 * Without this term the cap compares a NOTIONAL quantity against a MARGIN one
 * and never looks at opposing notional at all, so a market can refuse the
 * trade that would balance it while still accepting the trade that worsens
 * the imbalance. Measured on prod 2026-08-31: the BTC market held 734,349
 * long vs 928,994 short of notional — a short-heavy book — with 1,129 of long
 * headroom against 544,752 of short headroom, and was rejecting M$110 longs.
 */
const calculateMatchedCredit = (
  side: PerpDirection,
  state: PerpState,
  price: number
) => {
  const oppositeDirection = side === 'long' ? 'short' : 'long'
  const opposing = state.positions.filter(
    (p) => p.direction === oppositeDirection && p.size > 0
  )
  // The move this cap is sized for, in the direction that hurts the opposing
  // side: up for a long book, down for a short one.
  const x = 1 / PERP_OPEN_INTEREST_COVER_MULTIPLE
  const movedPrice = side === 'long' ? price * (1 + x) : price * (1 - x)

  const openInterest = opposing.reduce((sum, p) => sum + p.size, 0)
  // Per position, and floored at zero: one holder whose reserve does not move
  // must not have another's release netted away against it.
  const released = opposing.reduce(
    (sum, p) =>
      sum +
      Math.max(
        Math.min(p.costBasis, getPositionValue(p, price)) -
          Math.min(p.costBasis, getPositionValue(p, movedPrice)),
        0
      ),
    0
  )
  return Math.min(openInterest, released * PERP_OPEN_INTEREST_COVER_MULTIPLE)
}

/**
 * Aggregate side capacity at the current oracle price.
 *
 * `availableCover` deliberately deducts each opposite-side position's current
 * refundable value, capped at its cost basis. This is the same reserve used by
 * the ADL solvency calculation, so committed trader margin is not counted as
 * free backing for new exposure. `matchedCredit` then adds back the exposure
 * the opposing book funds out of its own losses — see above.
 */
export const getPerpOpenInterestCapacity = (
  side: PerpDirection,
  state: PerpState,
  price: number
): PerpOpenInterestCapacity => {
  assertPerpStateNumbers(state, price)

  const openInterest = state.positions
    .filter((p) => p.direction === side && p.size > 0)
    .reduce((sum, p) => sum + p.size, 0)
  assertFiniteNumber(`${side} open interest`, openInterest)

  const availableCover = calculateAvailableCover(side, state, price)
  assertFiniteNumber(`${side} available cover`, availableCover)

  const matchedCredit = calculateMatchedCredit(side, state, price)
  assertFiniteNumber(`${side} matched credit`, matchedCredit)

  // The telescoping above holds only where cover is non-negative. On a book
  // that is already short of its own reserve, cover floors at 0 while the
  // credit keeps counting reserved value the pool does not actually hold, so
  // bound the result explicitly: over a 1/M move this side's profit is OI/M,
  // and the most the opposing side can ever fund is its entire pool. This is a
  // no-op on every healthy book.
  const opposingPool = side === 'long' ? state.pool.S : state.pool.L
  const limit = Math.min(
    Math.max(availableCover, 0) * PERP_OPEN_INTEREST_COVER_MULTIPLE +
      matchedCredit,
    Math.max(opposingPool, 0) * PERP_OPEN_INTEREST_COVER_MULTIPLE
  )
  assertFiniteNumber(`${side} open interest limit`, limit)

  return {
    openInterest,
    availableCover,
    matchedCredit,
    limit,
    headroom: Math.max(limit - openInterest, 0),
    isWithinLimit: isPerpOpenInterestWithinLimit(openInterest, limit),
  }
}

/**
 * Capacity seen by the opening leg of a trade.
 *
 * A flip closes the trader's opposite-side position first. That close changes
 * both the opposing pool and the opposing open interest used by the cap, so a
 * client preview against the unmodified book can promise headroom that the
 * atomic engine correctly rejects after performing the close.
 */
export const getPerpOpenInterestCapacityForOpen = (
  side: PerpDirection,
  state: PerpState,
  price: number,
  positionToClose?: PerpPosition
): PerpOpenInterestCapacity => {
  // Validate before closing so a malformed row cannot disappear during the
  // simulated transition and turn into a plausible-looking preview.
  assertPerpStateNumbers(state, price)
  if (positionToClose?.direction === side)
    throw new Error('capacity preview may only close the opposite side')
  const stateBeforeOpen = positionToClose
    ? closePosition(state, positionToClose, price).state
    : state
  return getPerpOpenInterestCapacity(side, stateBeforeOpen, price)
}

/**
 * Solvency factor for a side (>= 1 means fully solvent). Used to refuse opens
 * that would immediately require ADL.
 */
export const solvencyFactor = (
  side: PerpDirection,
  state: PerpState,
  price: number
) => {
  const E = state.positions
    .filter((p) => p.direction === side && p.size > 0)
    .reduce((s, p) => s + Math.max(getUnrealizedEquity(p, price), 0), 0)
  const availableCover = calculateAvailableCover(side, state, price)
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

/**
 * Row-level sanity for one stored position. Extracted from
 * assertPerpStateNumbers (which still calls it, so the two can never drift)
 * because callers that touch a SINGLE row need the same rules before they act
 * on it — notably the engine, which must reject a corrupt row BEFORE closing
 * it or pricing a fee against it. Both operations read entryPrice through
 * getUnrealizedEquity, which silently returns 0 for a non-positive entry
 * price: a corrupt row would otherwise mark as flat and pay out its full
 * cost basis no matter where the oracle actually is.
 */
export const assertPerpPositionNumbers = (
  position: PerpPosition,
  label = 'position'
) => {
  assertFiniteNumber(`${label} size`, position.size)
  assertFiniteNumber(`${label} cost basis`, position.costBasis)
  assertFiniteNumber(`${label} original cost basis`, position.originalCostBasis)
  const takerFeeCostBasis = position.takerFeeCostBasis ?? 0
  assertFiniteNumber(`${label} taker fee cost basis`, takerFeeCostBasis)
  assertFiniteNumber(`${label} entry price`, position.entryPrice)
  assertFiniteNumber(`${label} leverage`, position.leverage)
  assertFiniteNumber(`${label} liquidation price`, position.liquidationPrice)
  assertFiniteNumber(`${label} opened time`, position.openedTime)
  assertFiniteNumber(`${label} updated time`, position.updatedTime)

  if (
    position.size < 0 ||
    position.costBasis < 0 ||
    position.originalCostBasis < 0 ||
    takerFeeCostBasis < 0
  )
    throw new Error(`${label} amounts must be non-negative`)
  if (position.entryPrice <= 0)
    throw new Error(`${label} entry price must be positive`)

  if (position.size === 0) {
    if (position.costBasis !== 0 || position.leverage !== 0)
      throw new Error(`${label} has margin without active exposure`)
  } else if (position.costBasis <= 0 || position.leverage <= 0) {
    throw new Error(`${label} active exposure must have positive margin`)
  }
}

/**
 * Structural / numeric sanity for a whole state: finite non-negative pools, a
 * positive price, and every row passing assertPerpPositionNumbers.
 *
 * Exported separately from assertPerpStateSolvent because the two answer
 * different questions and belong at different points in a transition.
 * SOLVENCY is a property the risk transitions are allowed to REPAIR —
 * processLiquidations and applyADL exist precisely to bring an insolvent book
 * back to factor 1, so asserting it on their input would fail closed on the
 * exact states they are there to fix. STRUCTURE is not repairable and must
 * hold going IN: a malformed row that reaches processLiquidations/applyADL
 * can be zeroed or removed by them, after which the post-transition assert
 * inspects a state the corrupt row has already left and passes.
 */
export const assertPerpStateNumbers = (state: PerpState, price: number) => {
  assertFiniteNumber('oracle price', price)
  if (price <= 0) throw new Error('oracle price must be positive')

  const { L, S } = state.pool
  assertFiniteNumber('long pool', L)
  assertFiniteNumber('short pool', S)
  if (L < 0 || S < 0) throw new Error('perp pools must be non-negative')
  assertFiniteNumber('total pool', L + S)

  state.positions.forEach((position, index) =>
    assertPerpPositionNumbers(position, `position ${index}`)
  )
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
