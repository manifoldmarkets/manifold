import { Bet } from './bet'
import { DPMContract } from './contract'

// See docs/dpm-explainer.md for the derivations of every formula here.

// ---------- Core math ----------

/** Total amount wagered given pool (y, n). */
export const dpmCost = (y: number, n: number) => Math.sqrt(y * y + n * n)

/** Instantaneous probability implied by a DPM pool. */
export const getDpmProbability = (pool: { YES: number; NO: number }) => {
  const { YES: y, NO: n } = pool
  const denom = y * y + n * n
  if (denom === 0) return 0.5
  return (y * y) / denom
}

/**
 * Initial pool for an ante with a given target probability.
 * Chosen so that C(y_start, n_start) = ante and P(y_start, n_start) = p.
 */
export const dpmInitialPool = (ante: number, initialProb: number) => ({
  YES: ante * Math.sqrt(initialProb),
  NO: ante * Math.sqrt(1 - initialProb),
})

/**
 * Given a DPM pool and a bet amount on `outcome`, return how many shares the
 * bet receives and the post-trade pool.
 *
 * Derivation: for a YES bet of $b, solve b = sqrt((y+s)^2 + n^2) - sqrt(y^2 + n^2).
 *   sqrt((y+s)^2 + n^2) = b + C       (where C = sqrt(y^2+n^2))
 *   (y+s)^2 = (b + C)^2 - n^2
 *   s = sqrt((b+C)^2 - n^2) - y
 * Symmetric for NO.
 */
export const dpmBuyShares = (
  pool: { YES: number; NO: number },
  outcome: 'YES' | 'NO',
  amount: number
): { shares: number; newPool: { YES: number; NO: number } } => {
  const { YES: y, NO: n } = pool
  const C = dpmCost(y, n)
  const newC = C + amount
  if (outcome === 'YES') {
    const other2 = n * n
    const newY = Math.sqrt(Math.max(0, newC * newC - other2))
    const shares = newY - y
    return { shares, newPool: { YES: newY, NO: n } }
  } else {
    const other2 = y * y
    const newN = Math.sqrt(Math.max(0, newC * newC - other2))
    const shares = newN - n
    return { shares, newPool: { YES: y, NO: newN } }
  }
}

/**
 * Max shares that can be bought before the probability reaches `targetProb`,
 * and the corresponding cost. Returns 0 when the current probability is
 * already past the target (in the direction of the outcome).
 *
 * For YES: s_max = n * sqrt(p*/(1-p*)) - y. Valid only when p* > current p.
 * For NO:  s_max = y * sqrt((1-p*)/p*) - n. Valid only when p* < current p.
 */
export const dpmSharesToReachProb = (
  pool: { YES: number; NO: number },
  targetProb: number,
  outcome: 'YES' | 'NO'
): { shares: number; cost: number } => {
  const { YES: y, NO: n } = pool
  const currentProb = getDpmProbability(pool)
  const C = dpmCost(y, n)

  if (outcome === 'YES') {
    if (targetProb <= currentProb) return { shares: 0, cost: 0 }
    if (targetProb >= 1) return { shares: Infinity, cost: Infinity }
    const sMax = n * Math.sqrt(targetProb / (1 - targetProb)) - y
    if (sMax <= 0) return { shares: 0, cost: 0 }
    const newC = dpmCost(y + sMax, n)
    return { shares: sMax, cost: newC - C }
  } else {
    if (targetProb >= currentProb) return { shares: 0, cost: 0 }
    if (targetProb <= 0) return { shares: Infinity, cost: Infinity }
    const sMax = y * Math.sqrt((1 - targetProb) / targetProb) - n
    if (sMax <= 0) return { shares: 0, cost: 0 }
    const newC = dpmCost(y, n + sMax)
    return { shares: sMax, cost: newC - C }
  }
}

/**
 * Pool after applying a pinned-price phase-2 step. During phase 2 both sides
 * contribute dC while probability stays fixed at p*. The taker on `outcome`
 * contributes takerCostFrac * dC (= 1 - p* for a YES taker-limit-order maker
 * case, etc.) and the maker contributes the rest. Both take shares
 * proportional to the relationship y = sqrt(p*) * pool, n = sqrt(1-p*) * pool.
 */
export const dpmPinnedStep = (
  pool: { YES: number; NO: number },
  pStar: number,
  dC: number
) => {
  // From y = sqrt(p*) * pool, n = sqrt(1-p*) * pool, and dPool = dC:
  //   dy = sqrt(p*) * dC,  dn = sqrt(1-p*) * dC.
  const dy = Math.sqrt(pStar) * dC
  const dn = Math.sqrt(1 - pStar) * dC
  return {
    newPool: { YES: pool.YES + dy, NO: pool.NO + dn },
    dy,
    dn,
  }
}

// ---------- Payout helpers ----------

/**
 * Mark-to-market / resolved payout for a DPM bet.
 * - YES: if the bet was on YES, the holder gets (shares / y) * C on YES resolution.
 * - NO:  symmetric.
 * - MKT: pool-weighted expected value p * (shares / y) * C for YES holder.
 * - CANCEL: refund the bet amount.
 */
export function calculateDpmPayout(
  contract: DPMContract,
  bet: Bet,
  outcome: 'YES' | 'NO' | 'MKT' | 'CANCEL'
) {
  if (outcome === 'CANCEL') return bet.amount ?? 0
  const { YES: y, NO: n } = contract.pool
  if (y <= 0 && n <= 0) return 0
  const C = dpmCost(y, n)
  if (outcome === 'YES') {
    if (bet.outcome !== 'YES' || y <= 0) return 0
    return (bet.shares / y) * C
  }
  if (outcome === 'NO') {
    if (bet.outcome !== 'NO' || n <= 0) return 0
    return (bet.shares / n) * C
  }
  // MKT
  const p = getDpmProbability(contract.pool)
  if (bet.outcome === 'YES' && y > 0) return p * (bet.shares / y) * C
  if (bet.outcome === 'NO' && n > 0) return (1 - p) * (bet.shares / n) * C
  return 0
}

/**
 * Aggregate-share variant used by metrics helpers (they only retain
 * `totalShares`, not the individual bets). Mark-to-market assuming current
 * pool probability.
 */
export const calculateDpmPayoutFromShares = (
  totalShares: { [outcome: string]: number },
  pool: { YES: number; NO: number }
) => {
  const { YES: y, NO: n } = pool
  if (y <= 0 && n <= 0) return 0
  const C = dpmCost(y, n)
  const p = getDpmProbability(pool)
  const yesShares = totalShares['YES'] ?? 0
  const noShares = totalShares['NO'] ?? 0
  const yesValue = y > 0 ? p * (yesShares / y) * C : 0
  const noValue = n > 0 ? (1 - p) * (noShares / n) * C : 0
  return yesValue + noValue
}

/**
 * Factor applied to a DPM bet's shares when converting the market to CPMM.
 * `shares * factor` is the number of CPMM tokens the bet is worth
 * post-conversion (equals the payout the bet would get if its side wins).
 */
export const dpmToCpmmShareFactor = (
  pool: { YES: number; NO: number },
  outcome: 'YES' | 'NO'
) => {
  const { YES: y, NO: n } = pool
  const C = dpmCost(y, n)
  if (outcome === 'YES') return y > 0 ? C / y : 0
  return n > 0 ? C / n : 0
}
