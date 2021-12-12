export type Bet = {
  id: string
  userId: string
  contractId: string
  amount: number // Amount of bet
  outcome: 'YES' | 'NO' // Chosen outcome
  createdTime: number
  probBefore: number
  probAverage: number
  probAfter: number
  dpmWeight: number // Dynamic Parimutuel weight
}