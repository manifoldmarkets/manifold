export type ContractMetric = {
  id: number
  contractId: string
  // TODO: Calculate this from the api endpoint
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
  hasNoShares: boolean
  hasShares: boolean
  hasYesShares: boolean
  invested: number
  loan: number
  maxSharesOutcome: string | null
  // Payout and profit will have to be calculated at the api endpoint, they're out of date now
  payout: number
  profit: number
  profitPercent: number
  totalShares: {
    [outcome: string]: number
  }
  totalSpent:
    | {
        [outcome: string]: number
      }
    | undefined
  userId: string
  userUsername?: string
  userName?: string
  userAvatarUrl?: string
  lastBetTime: number
  answerId: string | null
  profitAdjustment?: number
}

export type ContractMetricsByOutcome = Record<string, ContractMetric[]>
