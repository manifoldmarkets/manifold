import { Answer } from './answer'
import { Fees } from './fees'

export type FullContract<
  M extends DPM | CPMM,
  T extends Binary | Multi | FreeResponse
> = {
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

  createdTime: number // Milliseconds since epoch
  lastUpdatedTime: number // If the question or description was changed
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

export type Contract = FullContract<DPM | CPMM, Binary | Multi | FreeResponse>
export type BinaryContract = FullContract<DPM | CPMM, Binary>
export type FreeResponseContract = FullContract<DPM | CPMM, FreeResponse>

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

export type outcomeType = 'BINARY' | 'MULTI' | 'FREE_RESPONSE'

export const MAX_QUESTION_LENGTH = 480
export const MAX_DESCRIPTION_LENGTH = 10000
export const MAX_TAG_LENGTH = 60
