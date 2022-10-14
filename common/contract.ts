import { Answer } from './answer'
import { Fees } from './fees'
import { JSONContent } from '@tiptap/core'
import { GroupLink } from 'common/group'

export type AnyMechanism = DPM | CPMM
export type AnyOutcomeType =
  | Binary
  | MultipleChoice
  | PseudoNumeric
  | FreeResponse
  | Numeric

export type AnyContractType =
  | (CPMM & Binary)
  | (CPMM & PseudoNumeric)
  | (DPM & Binary)
  | (DPM & FreeResponse)
  | (DPM & Numeric)
  | (DPM & MultipleChoice)

export type Contract<T extends AnyContractType = AnyContractType> = {
  id: string
  slug: string // auto-generated; must be unique

  creatorId: string
  creatorName: string
  creatorUsername: string
  creatorAvatarUrl?: string

  question: string
  description: string | JSONContent // More info about what the contract is about
  tags: string[]
  lowercaseTags: string[]
  visibility: visibility

  createdTime: number // Milliseconds since epoch
  lastUpdatedTime?: number // Updated on new bet or comment
  lastBetTime?: number
  lastCommentTime?: number
  closeTime?: number // When no more trading is allowed

  isResolved: boolean
  resolutionTime?: number // When the contract creator resolved the market
  resolution?: string
  resolutionProbability?: number

  closeEmailsSent?: number

  volume: number
  volume24Hours: number
  volume7Days: number
  elasticity: number

  collectedFees: Fees

  groupSlugs?: string[]
  groupLinks?: GroupLink[]
  uniqueBettorIds?: string[]
  uniqueBettorCount?: number
  popularityScore?: number
  dailyScore?: number
  followerCount?: number
  featuredOnHomeRank?: number
  likedByUserIds?: string[]
  likedByUserCount?: number
  flaggedByUsernames?: string[]
  openCommentBounties?: number
  unlistedById?: string
} & T

export type BinaryContract = Contract & Binary
export type PseudoNumericContract = Contract & PseudoNumeric
export type NumericContract = Contract & Numeric
export type FreeResponseContract = Contract & FreeResponse
export type MultipleChoiceContract = Contract & MultipleChoice
export type DPMContract = Contract & DPM
export type CPMMContract = Contract & CPMM
export type DPMBinaryContract = BinaryContract & DPM
export type CPMMBinaryContract = BinaryContract & CPMM

export type DPM = {
  mechanism: 'dpm-2'

  pool: { [outcome: string]: number }
  phantomShares?: { [outcome: string]: number }
  totalShares: { [outcome: string]: number }
  totalBets: { [outcome: string]: number }
}

export type CPMM = {
  mechanism: 'cpmm-1'
  pool: { [outcome: string]: number }
  p: number // probability constant in y^p * n^(1-p) = k
  totalLiquidity: number // for historical reasons, this the total subsidy amount added in M$
  subsidyPool: number // current value of subsidy pool in M$
  prob: number
  probChanges: {
    day: number
    week: number
    month: number
  }
}

export type Binary = {
  outcomeType: 'BINARY'
  initialProbability: number
  resolutionProbability?: number // Used for BINARY markets resolved to MKT
  resolution?: resolution
}

export type PseudoNumeric = {
  outcomeType: 'PSEUDO_NUMERIC'
  min: number
  max: number
  isLogScale: boolean
  resolutionValue?: number

  // same as binary market; map everything to probability
  initialProbability: number
  resolutionProbability?: number
}

export type FreeResponse = {
  outcomeType: 'FREE_RESPONSE'
  answers: Answer[] // Used for outcomeType 'FREE_RESPONSE'.
  resolution?: string | 'MKT' | 'CANCEL'
  resolutions?: { [outcome: string]: number } // Used for MKT resolution.
}

export type MultipleChoice = {
  outcomeType: 'MULTIPLE_CHOICE'
  answers: Answer[]
  resolution?: string | 'MKT' | 'CANCEL'
  resolutions?: { [outcome: string]: number } // Used for MKT resolution.
}

export type Numeric = {
  outcomeType: 'NUMERIC'
  bucketCount: number
  min: number
  max: number
  resolutions?: { [outcome: string]: number } // Used for MKT resolution.
  resolutionValue?: number
}

export type outcomeType = AnyOutcomeType['outcomeType']
export type resolution = 'YES' | 'NO' | 'MKT' | 'CANCEL'
export const RESOLUTIONS = ['YES', 'NO', 'MKT', 'CANCEL'] as const
export const OUTCOME_TYPES = [
  'BINARY',
  'MULTIPLE_CHOICE',
  'FREE_RESPONSE',
  'PSEUDO_NUMERIC',
  'NUMERIC',
] as const

export const MAX_QUESTION_LENGTH = 240
export const MAX_DESCRIPTION_LENGTH = 16000
export const MAX_TAG_LENGTH = 60

export const CPMM_MIN_POOL_QTY = 0.01

export type visibility = 'public' | 'unlisted'
export const VISIBILITIES = ['public', 'unlisted'] as const
