// ============================================================================
// SIMPLIFIED CPMM (Constant Product Market Maker) FOR YES/NO MARKETS
// ============================================================================
// This is a simplified version of the AMM logic for binary YES/NO markets only
// Formula: y^p * n^(1-p) = k (constant)
// Where: y = YES shares, n = NO shares, p = probability constant
// ============================================================================

import {
  AngolaMarket,
  AngolaBet,
  BetOutcome,
  Fees,
  NO_FEES,
} from './types/angola-types'
import { getAngolaConfig } from './envs/angola'

const config = getAngolaConfig()

// ============================================================================
// CORE CPMM CALCULATIONS
// ============================================================================

export type Pool = {
  YES: number
  NO: number
}

export type CpmmState = {
  pool: Pool
  p: number // probability constant
  collectedFees: Fees
}

/**
 * Calculate current probability from pool state
 * Formula: prob = p * n / (p * n + (1-p) * y)
 */
export function getCpmmProbability(pool: Pool, p: number): number {
  const { YES: y, NO: n } = pool

  if (y <= 0 || n <= 0) return 0.5

  const prob = (p * n) / (p * n + (1 - p) * y)

  // Clamp to valid range
  return Math.max(0.01, Math.min(0.99, prob))
}

/**
 * Calculate shares received for a bet
 * Uses CPMM formula to determine how many shares the bet receives
 */
export function calculateCpmmShares(
  pool: Pool,
  p: number,
  betAmount: number,
  outcome: BetOutcome
): number {
  const { YES: y, NO: n } = pool

  // Calculate the constant k
  const k = Math.pow(y, p) * Math.pow(n, 1 - p)

  if (outcome === 'YES') {
    // Buying YES: add to NO pool, calculate new YES pool
    const newNo = n + betAmount
    const newYes = Math.pow(k / Math.pow(newNo, 1 - p), 1 / p)
    return y - newYes + betAmount
  } else {
    // Buying NO: add to YES pool, calculate new NO pool
    const newYes = y + betAmount
    const newNo = Math.pow(k / Math.pow(newYes, p), 1 / (1 - p))
    return n - newNo + betAmount
  }
}

/**
 * Calculate probability after a bet (before fees)
 */
export function getCpmmProbabilityAfterBet(
  pool: Pool,
  p: number,
  betAmount: number,
  outcome: BetOutcome
): number {
  const shares = calculateCpmmShares(pool, p, betAmount, outcome)

  const newPool: Pool =
    outcome === 'YES'
      ? { YES: pool.YES - shares + betAmount, NO: pool.NO + betAmount }
      : { YES: pool.YES + betAmount, NO: pool.NO - shares + betAmount }

  return getCpmmProbability(newPool, p)
}

// ============================================================================
// FEE CALCULATIONS
// ============================================================================

/**
 * Calculate fees for a bet
 * Uses platform and creator fee percentages from config
 */
export function calculateFees(betAmount: number, prob: number): Fees {
  const platformFeePercent = config.platformFeePercent / 100
  const creatorFeePercent = config.creatorFeePercent / 100

  // Fee is based on the bet amount and the "edge" (distance from 50%)
  const edge = Math.abs(prob - 0.5) * 2 // 0 to 1
  const feeMultiplier = 1 - edge * 0.5 // Higher fees when prob is closer to 50%

  const totalFeePercent =
    (platformFeePercent + creatorFeePercent) * feeMultiplier
  const totalFee = betAmount * totalFeePercent

  return {
    platformFee: betAmount * platformFeePercent * feeMultiplier,
    creatorFee: betAmount * creatorFeePercent * feeMultiplier,
    liquidityFee: 0,
  }
}

/**
 * Get total fee amount
 */
export function getTotalFees(fees: Fees): number {
  return fees.creatorFee + fees.platformFee + fees.liquidityFee
}

// ============================================================================
// BET CALCULATIONS
// ============================================================================

export type BetCalculation = {
  shares: number
  probBefore: number
  probAfter: number
  fees: Fees
  netAmount: number // Amount after fees
  newPool: Pool
}

/**
 * Calculate full bet details including fees
 */
export function calculateBet(
  pool: Pool,
  p: number,
  betAmount: number,
  outcome: BetOutcome
): BetCalculation {
  const probBefore = getCpmmProbability(pool, p)

  // Calculate fees
  const fees = calculateFees(betAmount, probBefore)
  const netAmount = betAmount - getTotalFees(fees)

  // Calculate shares for net amount (after fees)
  const shares = calculateCpmmShares(pool, p, netAmount, outcome)

  // Calculate new pool state
  const newPool: Pool =
    outcome === 'YES'
      ? { YES: pool.YES - shares + netAmount, NO: pool.NO + netAmount }
      : { YES: pool.YES + netAmount, NO: pool.NO - shares + netAmount }

  const probAfter = getCpmmProbability(newPool, p)

  return {
    shares,
    probBefore,
    probAfter,
    fees,
    netAmount,
    newPool,
  }
}

/**
 * Calculate the cost to buy a specific number of shares
 */
export function calculateCostForShares(
  pool: Pool,
  p: number,
  shares: number,
  outcome: BetOutcome
): number {
  const { YES: y, NO: n } = pool
  const k = Math.pow(y, p) * Math.pow(n, 1 - p)

  if (outcome === 'YES') {
    // Solve for amount: (y - shares + amount)^p * (n + amount)^(1-p) = k
    // This requires numerical solving, use binary search
    return binarySearchCost(pool, p, shares, outcome, k)
  } else {
    return binarySearchCost(pool, p, shares, outcome, k)
  }
}

function binarySearchCost(
  pool: Pool,
  p: number,
  targetShares: number,
  outcome: BetOutcome,
  k: number
): number {
  let low = 0
  let high = pool[outcome] * 10 // Upper bound

  for (let i = 0; i < 50; i++) {
    const mid = (low + high) / 2
    const shares = calculateCpmmShares(pool, p, mid, outcome)

    if (Math.abs(shares - targetShares) < 0.0001) {
      return mid
    }

    if (shares < targetShares) {
      low = mid
    } else {
      high = mid
    }
  }

  return (low + high) / 2
}

// ============================================================================
// SELL CALCULATIONS
// ============================================================================

export type SellCalculation = {
  saleAmount: number // Amount received (in AOA)
  probBefore: number
  probAfter: number
  fees: Fees
  newPool: Pool
}

/**
 * Calculate sale of shares
 */
export function calculateSell(
  pool: Pool,
  p: number,
  shares: number,
  outcome: BetOutcome
): SellCalculation {
  const probBefore = getCpmmProbability(pool, p)

  // Selling is the reverse of buying
  // When selling YES shares, you're essentially buying NO
  const { YES: y, NO: n } = pool
  const k = Math.pow(y, p) * Math.pow(n, 1 - p)

  let saleAmount: number
  let newPool: Pool

  if (outcome === 'YES') {
    // Selling YES: add shares to YES pool, remove from NO pool
    const newYes = y + shares
    const newNo = Math.pow(k / Math.pow(newYes, p), 1 / (1 - p))
    saleAmount = n - newNo
    newPool = { YES: newYes, NO: newNo }
  } else {
    // Selling NO: add shares to NO pool, remove from YES pool
    const newNo = n + shares
    const newYes = Math.pow(k / Math.pow(newNo, 1 - p), 1 / p)
    saleAmount = y - newYes
    newPool = { YES: newYes, NO: newNo }
  }

  // Calculate fees on sale
  const fees = calculateFees(saleAmount, probBefore)
  const netSaleAmount = saleAmount - getTotalFees(fees)

  const probAfter = getCpmmProbability(newPool, p)

  return {
    saleAmount: netSaleAmount,
    probBefore,
    probAfter,
    fees,
    newPool,
  }
}

// ============================================================================
// LIQUIDITY CALCULATIONS
// ============================================================================

/**
 * Calculate total liquidity in the pool
 * Uses geometric mean of YES and NO pools
 */
export function getPoolLiquidity(pool: Pool): number {
  return Math.sqrt(pool.YES * pool.NO)
}

/**
 * Add liquidity to pool (subsidy)
 * Maintains current probability while increasing pool size
 */
export function addLiquidity(
  pool: Pool,
  p: number,
  amount: number
): { newPool: Pool; liquidityShares: number } {
  const currentProb = getCpmmProbability(pool, p)
  const currentLiquidity = getPoolLiquidity(pool)

  // Calculate how much to add to each side to maintain probability
  const ratio = pool.YES / pool.NO
  const addNo = amount / (1 + ratio)
  const addYes = amount - addNo

  const newPool: Pool = {
    YES: pool.YES + addYes,
    NO: pool.NO + addNo,
  }

  const newLiquidity = getPoolLiquidity(newPool)
  const liquidityShares = newLiquidity - currentLiquidity

  return { newPool, liquidityShares }
}

// ============================================================================
// PAYOUT CALCULATIONS
// ============================================================================

export type PayoutInfo = {
  outcome: BetOutcome
  shares: number
  payout: number // In AOA
}

/**
 * Calculate payout for a resolved market
 */
export function calculatePayout(
  bet: AngolaBet,
  resolution: 'YES' | 'NO' | 'MKT' | 'CANCEL',
  resolutionProbability?: number
): number {
  if (resolution === 'CANCEL') {
    // Return original bet amount
    return Math.abs(bet.amount)
  }

  if (resolution === 'MKT' && resolutionProbability !== undefined) {
    // Partial resolution based on probability
    const yesWeight = resolutionProbability
    const noWeight = 1 - resolutionProbability

    if (bet.outcome === 'YES') {
      return bet.shares * yesWeight
    } else {
      return bet.shares * noWeight
    }
  }

  // Binary resolution
  if (bet.outcome === resolution) {
    // Winner gets 1 AOA per share
    return bet.shares
  } else {
    // Loser gets nothing
    return 0
  }
}

/**
 * Calculate all payouts for a market resolution
 */
export function calculateAllPayouts(
  bets: AngolaBet[],
  resolution: 'YES' | 'NO' | 'MKT' | 'CANCEL',
  resolutionProbability?: number
): Map<string, number> {
  const payoutsByUser = new Map<string, number>()

  for (const bet of bets) {
    if (bet.isRedemption) continue

    const payout = calculatePayout(bet, resolution, resolutionProbability)

    const currentPayout = payoutsByUser.get(bet.userId) || 0
    payoutsByUser.set(bet.userId, currentPayout + payout)
  }

  return payoutsByUser
}

// ============================================================================
// MARKET CREATION
// ============================================================================

/**
 * Create initial pool for a new market
 */
export function createInitialPool(
  initialProbability: number,
  initialLiquidity: number
): { pool: Pool; p: number } {
  // p is set to match initial probability
  const p = initialProbability

  // Calculate initial pool to achieve target probability with given liquidity
  // prob = p * n / (p * n + (1-p) * y)
  // We want: y = n (equal pools) when prob = 0.5 and p = 0.5
  // For other probabilities, we adjust the ratio

  // Start with equal pools
  const basePool = initialLiquidity / 2

  // Adjust based on probability
  // Higher probability = more NO shares in pool
  const yesPool = basePool * (1 + (0.5 - initialProbability))
  const noPool = basePool * (1 + (initialProbability - 0.5))

  return {
    pool: { YES: yesPool, NO: noPool },
    p,
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format probability as percentage
 */
export function formatProbability(prob: number): string {
  return `${(prob * 100).toFixed(1)}%`
}

/**
 * Validate bet amount
 */
export function validateBetAmount(amount: number): {
  valid: boolean
  error?: string
} {
  if (amount < config.minBetAmount) {
    return {
      valid: false,
      error: `Aposta minima: Kz ${config.minBetAmount}`,
    }
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return { valid: false, error: 'Valor de aposta invalido' }
  }

  return { valid: true }
}

/**
 * Validate probability
 */
export function validateProbability(prob: number): {
  valid: boolean
  error?: string
} {
  if (prob < 0.01 || prob > 0.99) {
    return {
      valid: false,
      error: 'Probabilidade deve estar entre 1% e 99%',
    }
  }

  return { valid: true }
}
