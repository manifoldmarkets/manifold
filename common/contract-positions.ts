export type ContractPositions = {
  contractId: string
  hasNoShares: boolean
  hasShares: boolean
  hasYesShares: boolean
  loan: number
  maxSharesOutcome: string | null
  totalShares: {
    [outcome: string]: number
  }
  userId: string
  userUsername: string
  userName: string
  userAvatarUrl: string
}
