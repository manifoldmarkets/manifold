import { Answer } from './answer'
import { Fees } from './fees'

export type AnyMechanism = DPM | CPMM
export type AnyOutcomeType = Binary | Multi | FreeResponse | Numeric

export type FullContract<M extends AnyMechanism, T extends AnyOutcomeType> = {
  id: string
  slug: string // auto-generated; must be unique

  creatorId: string
  creatorName: string
  creatorUsername: string
  creatorAvatarUrl?: string

  question: string
  description: string // More info about what the contract is about
  tags: string[]
  lowercaseTags: string[]
  visibility: 'public' | 'unlisted'

  createdTime: number // Milliseconds since epoch
  lastUpdatedTime?: number // Updated on new bet or comment
  lastBetTime?: number
  lastCommentTime?: number
  closeTime?: number // When no more trading is allowed

  isResolved: boolean
  resolutionTime?: number // When the contract creator resolved the market
  resolution?: string

  closeEmailsSent?: number

  volume: number
  volume24Hours: number
  volume7Days: number

  collectedFees: Fees
} & M &
  T

export type Contract = FullContract<AnyMechanism, AnyOutcomeType>
export type BinaryContract = FullContract<AnyMechanism, Binary>
export type FreeResponseContract = FullContract<AnyMechanism, FreeResponse>
export type NumericContract = FullContract<DPM, Numeric>

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
  totalLiquidity: number // in M$
}

export type FixedPayouts = CPMM

export type Binary = {
  outcomeType: 'BINARY'
  initialProbability: number
  resolutionProbability?: number // Used for BINARY markets resolved to MKT
  resolution?: 'YES' | 'NO' | 'MKT' | 'CANCEL'
}

export type Multi = {
  outcomeType: 'MULTI'
  multiOutcomes: string[] // Used for outcomeType 'MULTI'.
  resolutions?: { [outcome: string]: number } // Used for MKT resolution.
}

export type FreeResponse = {
  outcomeType: 'FREE_RESPONSE'
  answers: Answer[] // Used for outcomeType 'FREE_RESPONSE'.
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
export const OUTCOME_TYPES = [
  'BINARY',
  'MULTI',
  'FREE_RESPONSE',
  'NUMERIC',
] as const
export const MAX_QUESTION_LENGTH = 480
export const MAX_DESCRIPTION_LENGTH = 10000
export const MAX_TAG_LENGTH = 60
