export type Bet = {
  id: string
  userId: string
  contractId: string

  amount: number // Amount of USD bid
  outcome: 'YES' | 'NO' // Chosen outcome

  createdTime: number
  dpmWeight: number // Dynamic Parimutuel weight
}