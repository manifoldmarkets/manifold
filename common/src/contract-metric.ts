export type ContractMetric = {
  contractId: string
  from:
    | {
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
  payout: number
  profit: number
  profitPercent: number
  totalShares: {
    [outcome: string]: number
  }
  userId: string
  userUsername: string
  userName: string
  userAvatarUrl: string
  lastBetTime: number
}

export type ContractMetricsByOutcome = Record<string, ContractMetric[]>
