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
  invested: number
  payout: number
  profit: number
  profitPercent: number
  userId: string
  userUsername: string
  userName: string
  userAvatarUrl: string
}
