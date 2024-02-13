export type ContractMetric = {
  id: number
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
  /**  @depreacted */
  userUsername: string
  /**  @depreacted */
  userName: string
  /**  @depreacted */
  userAvatarUrl: string
  lastBetTime: number
  answerId: string | null
}

export type ContractMetricsByOutcome = Record<string, ContractMetric[]>
