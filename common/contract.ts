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
  visibility: 'public' | 'unlisted'

  outcomeType: 'BINARY' | 'MULTI'
  outcomes?: 'FREE_ANSWER' | string[]

  mechanism: 'dpm-2'
  phantomShares?: { [outcome: string]: number }
  pool: { [outcome: string]: number }
  totalShares: { [outcome: string]: number }
  totalBets: { [outcome: string]: number }

  createdTime: number // Milliseconds since epoch
  lastUpdatedTime: number // If the question or description was changed
  closeTime?: number // When no more trading is allowed

  isResolved: boolean
  resolutionTime?: number // When the contract creator resolved the market
  resolution?: string
  resolutionProbability?: number

  volume24Hours: number
  volume7Days: number
}
