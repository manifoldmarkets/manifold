export type Order = {
  id: string
  userId: string

  // denormalized for order lists
  userAvatarUrl: string
  userUsername: string
  userName: string

  contractId: string
  createdTime: number

  amount: number // bet size; negative if SELL bet
  outcome: 'YES' | 'NO'
  probBefore: number // [0, 1]. Created at this prob
  isFilled: boolean // Whether all the order amount has been filled.
  isCancelled: boolean // Whether to prevent any further fills.
  betId?: string // id of bet that filled this order.
}
