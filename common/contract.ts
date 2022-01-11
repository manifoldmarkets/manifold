export type Contract = {
  id: string
  slug: string // auto-generated; must be unique

  creatorId: string
  creatorName: string
  creatorUsername: string

  question: string
  description: string // More info about what the contract is about
  outcomeType: 'BINARY' // | 'MULTI' | 'interval' | 'date'
  // outcomes: ['YES', 'NO']

  startPool: { YES: number; NO: number }
  pool: { YES: number; NO: number }
  totalShares: { YES: number; NO: number }
  totalBets: { YES: number; NO: number }

  createdTime: number // Milliseconds since epoch
  lastUpdatedTime: number // If the question or description was changed
  closeTime?: number // When no more trading is allowed

  isResolved: boolean
  resolutionTime?: number // When the contract creator resolved the market
  resolution?: 'YES' | 'NO' | 'CANCEL' // Chosen by creator; must be one of outcomes

  volume24Hours: number
  volume7Days: number
}
