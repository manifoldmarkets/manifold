
export type Contract = {
  id: string // Chosen by creator; must be unique
  creatorId: string
  creatorName: string

  question: string
  description: string // More info about what the contract is about

  outcomeType: 'BINARY' // | 'MULTI' | 'interval' | 'date'
  // outcomes: ['YES', 'NO']
  seedAmounts: { YES: number; NO: number } 
  pot: { YES: number; NO: number } 

  createdTime: number // Milliseconds since epoch
  lastUpdatedTime: number // If the question or description was changed
  closeTime?: number // When no more trading is allowed

  // isResolved: boolean
  resolutionTime?: 10293849 // When the contract creator resolved the market; 0 if unresolved
  resolution?: 'YES' | 'NO' | 'CANCEL' // Chosen by creator; must be one of outcomes
}