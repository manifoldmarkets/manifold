import { maxBy } from 'lodash'

export type ContractMetric = {
  id: number
  userId: string
  contractId: string
  answerId: string | null
  lastBetTime: number
  hasNoShares: boolean
  hasShares: boolean
  hasYesShares: boolean
  invested: number
  loan: number
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

export const getMaxSharesOutcome = (metric: ContractMetric | undefined) => {
  return (
    metric?.maxSharesOutcome ??
    maxBy(Object.entries(metric?.totalShares ?? {}), ([, value]) => value)?.[0]
  )
}
