/**
 * CPMM (Constant Product Market Maker) Calculations
 * Based on: pool.YES * pool.NO = k (constant)
 */

const MIN_PROB = 0.01 // 1%
const MAX_PROB = 0.99 // 99%
const CPMM_MIN_POOL_QTY = 0.01

export type CPMMState = {
  pool: { YES: number; NO: number }
  prob: number
  totalLiquidity: number
}

export type BetResult = {
  shares: number
  newPool: { YES: number; NO: number }
  newProb: number
  fees: {
    creatorFee: number
    platformFee: number
    liquidityFee: number
  }
}

// Calculate probability from pool
export function calculateProbability(pool: {
  YES: number
  NO: number
}): number {
  const { YES, NO } = pool
  const total = YES + NO

  if (total === 0) return 0.5

  const prob = NO / total

  // Clamp to [MIN_PROB, MAX_PROB]
  return Math.max(MIN_PROB, Math.min(MAX_PROB, prob))
}

// Calculate shares and new pool for a bet
export function calculateBet(
  state: CPMMState,
  betAmount: number,
  outcome: 'YES' | 'NO'
): BetResult {
  const { pool } = state

  // Take fees from bet amount
  const fees = calculateFees(betAmount)
  const amountAfterFees =
    betAmount - fees.creatorFee - fees.platformFee - fees.liquidityFee

  // Add liquidity fee to the pool
  const liquidityAdd = fees.liquidityFee / 2

  // Calculate new pool after bet
  const newPool = { ...pool }

  if (outcome === 'YES') {
    // Buying YES means adding to NO pool
    newPool.NO += amountAfterFees
    newPool.NO += liquidityAdd
    newPool.YES += liquidityAdd

    // Calculate shares using constant product formula
    // k = YES * NO (constant)
    const k = pool.YES * pool.NO
    const newYES = k / newPool.NO
    const shares = pool.YES - newYES

    newPool.YES = Math.max(CPMM_MIN_POOL_QTY, newYES)

    return {
      shares: Math.max(0, shares),
      newPool,
      newProb: calculateProbability(newPool),
      fees,
    }
  } else {
    // Buying NO means adding to YES pool
    newPool.YES += amountAfterFees
    newPool.YES += liquidityAdd
    newPool.NO += liquidityAdd

    // Calculate shares
    const k = pool.YES * pool.NO
    const newNO = k / newPool.YES
    const shares = pool.NO - newNO

    newPool.NO = Math.max(CPMM_MIN_POOL_QTY, newNO)

    return {
      shares: Math.max(0, shares),
      newPool,
      newProb: calculateProbability(newPool),
      fees,
    }
  }
}

// Calculate shares that can be sold
export function calculateSale(
  state: CPMMState,
  shares: number,
  outcome: 'YES' | 'NO'
): { saleValue: number; newPool: { YES: number; NO: number }; newProb: number } {
  const { pool } = state

  const k = pool.YES * pool.NO
  const newPool = { ...pool }

  if (outcome === 'YES') {
    // Selling YES shares
    newPool.YES += shares
    newPool.NO = k / newPool.YES

    const saleValue = pool.NO - newPool.NO

    return {
      saleValue: Math.max(0, saleValue),
      newPool,
      newProb: calculateProbability(newPool),
    }
  } else {
    // Selling NO shares
    newPool.NO += shares
    newPool.YES = k / newPool.NO

    const saleValue = pool.YES - newPool.YES

    return {
      saleValue: Math.max(0, saleValue),
      newPool,
      newProb: calculateProbability(newPool),
    }
  }
}

// Calculate fees (1% creator, 1% platform, 0.3% liquidity)
export function calculateFees(betAmount: number) {
  const CREATOR_FEE_RATE = 0.01 // 1%
  const PLATFORM_FEE_RATE = 0.01 // 1%
  const LIQUIDITY_FEE_RATE = 0.003 // 0.3%

  return {
    creatorFee: betAmount * CREATOR_FEE_RATE,
    platformFee: betAmount * PLATFORM_FEE_RATE,
    liquidityFee: betAmount * LIQUIDITY_FEE_RATE,
  }
}

// Get initial pool for a given probability
export function getInitialPool(
  prob: number,
  ante: number
): { YES: number; NO: number } {
  // For CPMM, we want: NO / (YES + NO) = prob
  // And: YES + NO = ante * 2 (we add equal amounts to both sides)

  const NO = prob * ante * 2
  const YES = ante * 2 - NO

  return {
    YES: Math.max(CPMM_MIN_POOL_QTY, YES),
    NO: Math.max(CPMM_MIN_POOL_QTY, NO),
  }
}

// Get ante (market creation cost) based on outcome type
export function getAnte(outcomeType: string): number {
  switch (outcomeType) {
    case 'BINARY':
      return 100 // 100 M$
    case 'MULTIPLE_CHOICE':
      return 500 // 500 M$
    default:
      return 100
  }
}

// Check if trading is allowed
export function tradingAllowed(contract: any): boolean {
  const now = Date.now()

  // Check if market is closed
  if (contract.closeTime && now > contract.closeTime) {
    return false
  }

  // Check if market is resolved
  if (contract.isResolved || contract.resolution) {
    return false
  }

  return true
}
