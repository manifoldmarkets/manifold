export type Bet = {
  id: string
  userId: string
  contractId: string

  amount: number // bet size; negative if SELL bet
  outcome: 'YES' | 'NO'
  dpmWeight: number // dynamic parimutuel pool weight; negative if SELL bet

  probBefore: number
  probAverage: number
  probAfter: number

  sale?: {
    amount: { YES: number, NO: number } // amount user makes from YES and NO pools from sale
    betId: string // id of bet being sold
  }
  
  isSold?: boolean // true if this BUY bet has been sold 

  createdTime: number
}