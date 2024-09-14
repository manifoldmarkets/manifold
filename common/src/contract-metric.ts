export type ContractMetric = {
  // These we can calculate during the bet
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
  totalSpent:
    | {
        [outcome: string]: number
      }
    | undefined
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
  payout: number
  profit: number
  profitPercent: number
  userUsername?: string
  userName?: string
  userAvatarUrl?: string
  profitAdjustment?: number
}

export type ContractMetricsByOutcome = Record<string, ContractMetric[]>
