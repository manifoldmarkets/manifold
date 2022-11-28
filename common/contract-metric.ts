export type ContractMetric = {
  loan: number
  profitPercent: number
  contractId: string
  payout: number
  hasYesShares: boolean
  maxSharesOutcome: string | null
  hasShares: boolean
  hasNoShares: boolean
  profit: number
  invested: number
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
}
