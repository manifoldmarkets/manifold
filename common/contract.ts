export type Contract<outcomeType extends 'BINARY' | 'MULTI' = 'BINARY'> = {
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

  outcomeType: outcomeType
  outcomes: {
    BINARY: undefined
    MULTI: 'FREE_ANSWER' | string[]
  }[outcomeType]

  mechanism: 'dpm-2'
  phantomShares: {
    BINARY: { YES: number; NO: number }
    MULTI: undefined
  }[outcomeType]
  pool: {
    BINARY: { YES: number; NO: number }
    MULTI: { [answerId: string]: number }
  }[outcomeType]
  totalShares: {
    BINARY: { YES: number; NO: number }
    MULTI: { [answerId: string]: number }
  }[outcomeType]
  totalBets: {
    BINARY: { YES: number; NO: number }
    MULTI: { [answerId: string]: number }
  }[outcomeType]

  createdTime: number // Milliseconds since epoch
  lastUpdatedTime: number // If the question or description was changed
  closeTime?: number // When no more trading is allowed

  isResolved: boolean
  resolutionTime?: number // When the contract creator resolved the market
  resolution?: {
    BINARY: outcome
    MULTI: string
  }[outcomeType]
  resolutionProbability?: number

  volume24Hours: number
  volume7Days: number
}

export type outcome = 'YES' | 'NO' | 'CANCEL' | 'MKT'
