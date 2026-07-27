import { keys, maxBy, uniq } from 'lodash'

export type ContractMetric = {
  id: number
  userId: string
  contractId: string
  answerId: string | null
  lastBetTime: number
  lastProb: number | null
  hasNoShares: boolean
  hasShares: boolean
  hasYesShares: boolean
  invested: number
  loan: number // Free loan (interest-free)
  marginLoan: number // Margin loan (with interest)
  maxSharesOutcome: string | null
  totalShares: {
    [outcome: string]: number
  }
  totalSpent: // This is what's currently spent by outcome
  | {
        [outcome: string]: number
      }
    | undefined
  payout: number
  totalAmountSold: number // This is the sum of all negative amounts/redemptions
  totalAmountInvested: number // This is the sum of all positive amounts
  profit: number
  profitPercent: number
  previousProfit?: number
  from:
    | {
        // Monthly is not updated atm bc it's not used
        [period: string]: {
          profit: number
          profitPercent: number
          invested: number
          prevValue: number
          value: number
        }
      }
    | undefined
  /*@deprecated join with users table*/
  userUsername?: string
  /*@deprecated join with users table*/
  userName?: string
  /*@deprecated join with user table*/
  userAvatarUrl?: string
}

export type ContractMetricsByOutcome = Record<string, ContractMetric[]>

export const isSummary = (
  metric: ContractMetric | Omit<ContractMetric, 'id'>
) => metric.answerId === null

const flipOutcomeMap = (map: { [outcome: string]: number } | undefined) =>
  map === undefined ? undefined : { ...map, YES: map.NO ?? 0, NO: map.YES ?? 0 }

// Restate a position held on one answer of a two-sided (versus) market as the
// equivalent position on the other answer: YES on A is NO on B and vice versa.
// Profit, investment and loans are side-agnostic, so only the share/spend
// breakdown, the winning outcome and the answer's probability move.
export const flipContractMetricSides = (
  metric: ContractMetric,
  newAnswerId: string
): ContractMetric => ({
  ...metric,
  answerId: newAnswerId,
  hasYesShares: metric.hasNoShares,
  hasNoShares: metric.hasYesShares,
  totalShares: flipOutcomeMap(metric.totalShares) ?? {},
  totalSpent: flipOutcomeMap(metric.totalSpent),
  maxSharesOutcome:
    metric.maxSharesOutcome === 'YES'
      ? 'NO'
      : metric.maxSharesOutcome === 'NO'
      ? 'YES'
      : metric.maxSharesOutcome,
  lastProb: metric.lastProb === null ? null : 1 - metric.lastProb,
})

const addOutcomeMaps = (
  a: { [outcome: string]: number } | undefined,
  b: { [outcome: string]: number } | undefined
) => {
  if (a === undefined && b === undefined) return undefined
  const outcomes = uniq([...keys(a ?? {}), ...keys(b ?? {})])
  return Object.fromEntries(
    outcomes.map((o) => [o, (a?.[o] ?? 0) + (b?.[o] ?? 0)])
  )
}

// Add up two positions the same user holds in the same market. Only safe once
// both are stated in the same frame — see flipContractMetricSides. Used to net
// out a versus trader who holds one answer directly and the other by its
// opposite; without it they'd show up twice, or get silently deduped away.
export const combineContractMetrics = (
  a: ContractMetric,
  b: ContractMetric
): ContractMetric => {
  const totalShares = addOutcomeMaps(a.totalShares, b.totalShares) ?? {}
  const invested = a.invested + b.invested
  const profit = a.profit + b.profit
  return {
    ...a,
    totalShares,
    totalSpent: addOutcomeMaps(a.totalSpent, b.totalSpent),
    hasYesShares: (totalShares.YES ?? 0) > 0,
    hasNoShares: (totalShares.NO ?? 0) > 0,
    hasShares: (totalShares.YES ?? 0) > 0 || (totalShares.NO ?? 0) > 0,
    maxSharesOutcome:
      (totalShares.YES ?? 0) >= (totalShares.NO ?? 0) ? 'YES' : 'NO',
    invested,
    profit,
    profitPercent: invested > 0 ? (profit / invested) * 100 : 0,
    payout: a.payout + b.payout,
    loan: a.loan + b.loan,
    marginLoan: a.marginLoan + b.marginLoan,
    totalAmountInvested: a.totalAmountInvested + b.totalAmountInvested,
    totalAmountSold: a.totalAmountSold + b.totalAmountSold,
    lastBetTime: Math.max(a.lastBetTime, b.lastBetTime),
    // Period-over-period breakdowns aren't additive across sides; drop rather
    // than report one side's numbers as if they covered both.
    from: undefined,
    previousProfit: undefined,
  }
}

export const getMaxSharesOutcome = (metric: ContractMetric | undefined) => {
  return (
    metric?.maxSharesOutcome ??
    maxBy(Object.entries(metric?.totalShares ?? {}), ([, value]) => value)?.[0]
  )
}
