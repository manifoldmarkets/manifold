import { Answer, DpmAnswer } from './answer'
import { Bet } from './bet'
import { HistoryPoint } from './chart'
import { Fees } from './fees'
import { JSONContent } from '@tiptap/core'
import { GroupLink } from 'common/group'
import { ContractMetric, ContractMetricsByOutcome } from './contract-metric'
import { ShareholderStats } from './supabase/contract-metrics'
import { ContractComment } from './comment'
import { ENV_CONFIG } from './envs/constants'
import { formatMoney, formatPercent } from './util/format'
import { getLiquidity } from './calculate-cpmm-multi'
import { sum } from 'lodash'
import { getDisplayProbability } from 'common/calculate'

/************************************************

supabase status: columns exist for
  slug: text
  creatorId: text
  question: text
  visibility: text
  mechanism: text
  outcomeType: text
  createdTime: timestamp (from millis)
  closeTime?: timestamp (from millis)
  resolutionTime?: timestamp (from millis)
  resolution?: text
  resolutionProbability?: numeric
  popularityScore: numeric

any changes to the type of these columns in firestore will require modifying
the supabase trigger, or replication of contracts may fail!

*************************************************/

export type AnyOutcomeType =
  | Binary
  | MultipleChoice
  | PseudoNumeric
  | FreeResponse
  | Numeric
  | Cert
  | QuadraticFunding
  | Stonk

export type AnyContractType =
  | (CPMM & Binary)
  | (CPMM & PseudoNumeric)
  | (DPM & Binary)
  | (DPM & FreeResponse)
  | (DPM & Numeric)
  | (DPM & MultipleChoice)
  | (Uniswap2 & Cert)
  | (CPMM2 & MultipleChoice)
  | QuadraticFunding
  | (CPMM & Stonk)
  | CPMMMulti

export type Contract<T extends AnyContractType = AnyContractType> = {
  id: string
  slug: string // auto-generated; must be unique

  creatorId: string
  creatorName: string
  creatorUsername: string
  creatorAvatarUrl?: string
  creatorCreatedTime?: number

  question: string
  description: string | JSONContent // More info about what the contract is about
  visibility: visibility

  createdTime: number // Milliseconds since epoch
  lastUpdatedTime: number // Updated on new bet or comment
  lastBetTime?: number
  lastCommentTime?: number
  closeTime?: number // When no more trading is allowed
  deleted?: boolean // If true, don't show question anywhere.

  isResolved: boolean
  resolutionTime?: number // When the contract creator resolved the question
  resolution?: string
  resolutionProbability?: number

  closeEmailsSent?: number

  volume: number
  volume24Hours: number
  elasticity: number

  collectedFees: Fees

  groupSlugs?: string[]
  groupLinks?: GroupLink[]
  uniqueBettorCount: number
  popularityScore: number
  importanceScore: number
  dailyScore: number
  likedByUserCount?: number
  unlistedById?: string
  featuredLabel?: string
  isTwitchContract?: boolean

  coverImageUrl?: string
} & T

export type DPMContract = Contract & DPM
export type CPMMContract = Contract & CPMM
export type CPMMMultiContract = Contract & CPMMMulti

export type BinaryContract = Contract & Binary
export type DPMBinaryContract = BinaryContract & DPM
export type CPMMBinaryContract = BinaryContract & CPMM
export type PseudoNumericContract = Contract & PseudoNumeric
export type NumericContract = Contract & Numeric
export type FreeResponseContract = Contract & FreeResponse
export type MultipleChoiceContract = Contract & MultipleChoice
export type CertContract = Contract & Cert
export type Uniswap2CertContract = CertContract & Uniswap2
export type DpmMultipleChoiceContract = Contract & MultipleChoice & DPM
export type QuadraticFundingContract = Contract & QuadraticFunding
export type StonkContract = Contract & Stonk
export type CPMMStonkContract = StonkContract & CPMM

export type BinaryOrPseudoNumericContract =
  | CPMMBinaryContract
  | PseudoNumericContract

export type DPM = {
  mechanism: 'dpm-2'

  pool: { [outcome: string]: number }
  phantomShares?: { [outcome: string]: number }
  totalShares: { [outcome: string]: number }
  totalBets: { [outcome: string]: number }
}

// Deprecated: Simple constant product question maker for a variable number of outcomes.
/** @deprecated */
export type CPMM2 = {
  mechanism: 'cpmm-2'
  pool: { [outcome: string]: number }
  subsidyPool: number // current value of subsidy pool in M$
}

export type CPMM = {
  mechanism: 'cpmm-1'
  pool: { [outcome: string]: number }
  p: number // probability constant in y^p * n^(1-p) = k
  totalLiquidity: number // for historical reasons, this the total subsidy amount added in Ṁ
  subsidyPool: number // current value of subsidy pool in Ṁ
  prob: number
  probChanges: {
    day: number
    week: number
    month: number
  }
}

export type Uniswap2 = {
  mechanism: 'uniswap-2'
  // outcome can be e.g. 'M$' or a 'SHARE'
  pool: { [outcome: string]: number }
  // The price of the token in terms of M$. Similar to prob.
  price: number
}

/**
 * Implemented as a set of cpmm-1 binary contracts, one for each answer.
 * The mechanism is stored among the contract's answers, which each
 * reference this contract id.
 */
export type CPMMMulti = {
  mechanism: 'cpmm-multi-1'
  outcomeType: 'MULTIPLE_CHOICE'
  shouldAnswersSumToOne: boolean
  totalLiquidity: number // for historical reasons, this the total subsidy amount added in Ṁ
  subsidyPool: number // current value of subsidy pool in Ṁ

  // Answers chosen on resolution, with the weights of each answer.
  // Weights sum to 1 if shouldAnswersSumToOne is true. Otherwise, range from 0 to 1 for each answerId.
  resolutions?: { [answerId: string]: number }

  // NOTE: This field is stored in the answers table and must be denormalized to the client.
  answers: Answer[]
}

export type Cert = {
  outcomeType: 'CERT'
}

export type QuadraticFunding = {
  outcomeType: 'QUADRATIC_FUNDING'
  mechanism: 'qf'
  answers: DpmAnswer[]
  // Mapping of how much each user has contributed to the matching pool
  // Note: Our codebase assumes every contract has a pool, which is why this isn't just a constant
  pool: { M$: number }

  // Used when the funding round pays out
  resolution?: 'MKT' | 'CANCEL'
  resolutions?: { [outcome: string]: number } // Used for MKT resolution.
}

export type Binary = {
  outcomeType: 'BINARY'
  initialProbability: number
  resolutionProbability?: number // Used for BINARY questions resolved to MKT
  resolution?: resolution
}

export type PseudoNumeric = {
  outcomeType: 'PSEUDO_NUMERIC'
  min: number
  max: number
  isLogScale: boolean
  resolutionValue?: number

  // same as binary question; map everything to probability
  initialProbability: number
  resolutionProbability?: number
}

export type FreeResponse = {
  outcomeType: 'FREE_RESPONSE'
  answers: DpmAnswer[] // Used for outcomeType 'FREE_RESPONSE'.
  resolution?: string | 'MKT' | 'CANCEL'
  resolutions?: { [outcome: string]: number } // Used for MKT resolution.
}

export type MultipleChoice = {
  outcomeType: 'MULTIPLE_CHOICE'
  answers: DpmAnswer[]
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

export type Stonk = {
  outcomeType: 'STONK'
  initialProbability: number
}

export type MultiContract = (
  | FreeResponseContract
  | MultipleChoiceContract
  | CPMMMultiContract
) & {
  answers: (DpmAnswer | Answer)[]
  resolutions?: { [outcome: string]: number }
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
  'CERT',
  'QUADRATIC_FUNDING',
  'STONK',
] as const

export function contractPathWithoutContract(
  creatorUsername: string,
  slug: string
) {
  return `/${creatorUsername}/${slug}`
}

export function contractUrl(contract: Contract) {
  return `https://${ENV_CONFIG.domain}${contractPath(contract)}`
}

export function contractPool(contract: Contract) {
  return contract.mechanism === 'cpmm-1'
    ? formatMoney(contract.totalLiquidity)
    : contract.mechanism === 'cpmm-2'
    ? formatMoney(getLiquidity(contract.pool))
    : contract.mechanism === 'dpm-2'
    ? formatMoney(sum(Object.values(contract.pool)))
    : contract.mechanism === 'cpmm-multi-1'
    ? formatMoney(
        sum(
          contract.answers.map((a) =>
            getLiquidity({ YES: a.poolYes, NO: a.poolNo })
          )
        )
      )
    : 'Empty pool'
}

export function getBinaryProbPercent(contract: BinaryContract) {
  return formatPercent(getDisplayProbability(contract))
}

export function tradingAllowed(contract: Contract) {
  return (
    !contract.isResolved &&
    (!contract.closeTime || contract.closeTime > Date.now())
  )
}

export const MAX_QUESTION_LENGTH = 120
export const MAX_DESCRIPTION_LENGTH = 16000
export const MAX_TAG_LENGTH = 60

export const CPMM_MIN_POOL_QTY = 0.01

export type visibility = 'public' | 'unlisted' | 'private'
export const VISIBILITIES = ['public', 'unlisted', 'private'] as const

export function contractPath(contract: Contract) {
  return `/${contract.creatorUsername}/${contract.slug}`
}

export type ContractParams = {
  contract: Contract
  historyData: {
    bets: Bet[]
    points: HistoryPoint<Partial<Bet>>[]
  }
  pointsString?: string
  comments: ContractComment[]
  userPositionsByOutcome: ContractMetricsByOutcome
  totalPositions: number
  totalBets: number
  topContractMetrics: ContractMetric[]
  creatorTwitter?: string
  relatedContracts: Contract[]
  shareholderStats?: ShareholderStats
}
