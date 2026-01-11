import { ANNUAL_INTEREST_RATE, INTEREST_ENABLED } from 'common/economy'
import { Answer } from 'common/answer'
import {
  CPMMContract,
  CPMMMultiContract,
  MarketContract,
} from 'common/contract'
import { log } from 'shared/utils'

const MS_PER_YEAR = 365 * 24 * 60 * 60 * 1000

/**
 * Check if a market is eligible for pool interest.
 * Must be MANA, public (listed), and ranked.
 */
export function shouldAccruePoolInterest(contract: MarketContract): boolean {
  // Feature flag
  if (!INTEREST_ENABLED) return false

  // Only MANA markets
  if (contract.token !== 'MANA') return false

  // Must be listed (public visibility)
  if (contract.visibility !== 'public') return false

  // Must be ranked (isRanked !== false)
  if (contract.isRanked === false) return false

  return true
}

/**
 * Calculate the interest multiplier based on time elapsed.
 */
function getInterestMultiplier(lastUpdateTime: number, now: number): number {
  const yearsFraction = (now - lastUpdateTime) / MS_PER_YEAR
  return 1 + ANNUAL_INTEREST_RATE * yearsFraction
}

// ============================================================================
// Types
// ============================================================================

export type Cpmm1Pool = { YES: number; NO: number }
export type AnswerPoolUpdate = { id: string; poolYes: number; poolNo: number }

// ============================================================================
// Pure calculation functions
// ============================================================================

/**
 * Calculate pool with interest for a CPMM-1 contract.
 * Pure function - returns the new pool values without any side effects.
 */
export function calculatePoolInterestCpmm1(
  contract: CPMMContract,
  now: number = Date.now()
): Cpmm1Pool {
  const pool = { YES: contract.pool.YES, NO: contract.pool.NO }

  if (!shouldAccruePoolInterest(contract)) {
    return pool
  }

  const lastUpdate = contract.lastBetTime ?? contract.createdTime
  const multiplier = getInterestMultiplier(lastUpdate, now)

  if (multiplier <= 1) {
    return pool
  }

  const newPool = {
    YES: pool.YES * multiplier,
    NO: pool.NO * multiplier,
  }

  const interestAdded = {
    YES: newPool.YES - pool.YES,
    NO: newPool.NO - pool.NO,
  }

  if (interestAdded.YES > 0.001 || interestAdded.NO > 0.001) {
    log('Calculating pool interest for cpmm-1', {
      contractId: contract.id,
      timeSinceLastBet: now - lastUpdate,
      oldPool: pool,
      newPool,
      interestAdded,
    })
  }

  return newPool
}

/**
 * Calculate pools with interest for all answers in a multi-answer contract.
 * Pure function - returns the new pool values without any side effects.
 */
export function calculatePoolInterestMulti(
  contract: CPMMMultiContract,
  answers: Answer[],
  now: number = Date.now()
): AnswerPoolUpdate[] {
  if (!shouldAccruePoolInterest(contract)) {
    return answers.map((a) => ({
      id: a.id,
      poolYes: a.poolYes,
      poolNo: a.poolNo,
    }))
  }

  const lastUpdate = contract.lastBetTime ?? contract.createdTime
  const multiplier = getInterestMultiplier(lastUpdate, now)

  if (multiplier <= 1) {
    return answers.map((a) => ({
      id: a.id,
      poolYes: a.poolYes,
      poolNo: a.poolNo,
    }))
  }

  const updates: AnswerPoolUpdate[] = []
  let totalInterestYes = 0
  let totalInterestNo = 0

  for (const answer of answers) {
    const newPoolYes = answer.poolYes * multiplier
    const newPoolNo = answer.poolNo * multiplier

    totalInterestYes += newPoolYes - answer.poolYes
    totalInterestNo += newPoolNo - answer.poolNo

    updates.push({
      id: answer.id,
      poolYes: newPoolYes,
      poolNo: newPoolNo,
    })
  }

  if (totalInterestYes > 0.001 || totalInterestNo > 0.001) {
    log('Calculating pool interest for multi-answer', {
      contractId: contract.id,
      answerCount: answers.length,
      totalInterestYes,
      totalInterestNo,
    })
  }

  return updates
}
