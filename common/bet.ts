export type Bet<outcomeType extends 'BINARY' | 'MULTI' = 'BINARY'> = {
  id: string
  userId: string
  contractId: string

  amount: number // bet size; negative if SELL bet
  outcome: {
    BINARY: 'YES' | 'NO'
    MULTI: string
  }[outcomeType]
  shares: number // dynamic parimutuel pool weight; negative if SELL bet

  probBefore: number
  probAfter: number

  sale?: {
    amount: number // amount user makes from sale
    betId: string // id of bet being sold
    // TODO: add sale time?
  }

  isSold?: boolean // true if this BUY bet has been sold
  isAnte?: boolean

  createdTime: number
}
