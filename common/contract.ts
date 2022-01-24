export type Contract = {
  id: string
  slug: string // auto-generated; must be unique

  creatorId: string
  creatorName: string
  creatorUsername: string
  creatorAvatarUrl?: string // Start requiring after 2022-03-01

  question: string
  description: string // More info about what the contract is about
  tags: string[]
  lowercaseTags: string[]
  outcomeType: 'BINARY' // | 'MULTI' | 'interval' | 'date'
  visibility: 'public' | 'unlisted'

  mechanism: 'dpm-2'
  phantomShares: { YES: number; NO: number }
  pool: { YES: number; NO: number }
  totalShares: { YES: number; NO: number }
  totalBets: { YES: number; NO: number }

  createdTime: number // Milliseconds since epoch
  lastUpdatedTime: number // If the question or description was changed
  closeTime?: number // When no more trading is allowed

  isResolved: boolean
  resolutionTime?: number // When the contract creator resolved the market
  resolution?: outcome // Chosen by creator; must be one of outcomes

  volume24Hours: number
  volume7Days: number
}

export type outcome = 'YES' | 'NO' | 'CANCEL' | 'MKT'
