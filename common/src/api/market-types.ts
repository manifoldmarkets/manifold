import { JSONContent } from '@tiptap/core'
import { Answer, DpmAnswer, MAX_ANSWERS } from 'common/answer'
import { Bet } from 'common/bet'
import { getAnswerProbability, getProbability } from 'common/calculate'
import { Comment } from 'common/comment'
import {
  CREATEABLE_OUTCOME_TYPES,
  Contract,
  MAX_QUESTION_LENGTH,
  MultiContract,
  RESOLUTIONS,
  VISIBILITIES,
} from 'common/contract'
import { DOMAIN } from 'common/envs/constants'
import { removeUndefinedProps } from 'common/util/object'
import { richTextToString } from 'common/util/parse'
import { getMappedValue } from 'common/pseudo-numeric'
import { z } from 'zod'
import { MAX_ID_LENGTH } from 'common/group'
import { contentSchema } from 'common/api/zod-types'

export type LiteMarket = {
  // Unique identifier for this market
  id: string

  // Attributes about the creator
  creatorId: string
  creatorUsername: string
  creatorName: string
  createdTime: number
  creatorAvatarUrl?: string

  // Market attributes. All times are in milliseconds since epoch
  closeTime?: number
  question: string
  slug: string
  url: string
  outcomeType: string
  mechanism: string

  pool?: { [outcome: string]: number }
  probability?: number
  p?: number
  totalLiquidity?: number
  // For pseudo-numeric
  value?: number
  min?: number
  max?: number

  volume: number
  volume24Hours: number

  isResolved: boolean
  resolution?: string
  resolutionTime?: number
  resolutionProbability?: number

  uniqueBettorCount: number
  lastUpdatedTime?: number
  lastBetTime?: number
}
export type ApiAnswer =
  | (DpmAnswer & {
      probability: number
    })
  | Omit<
      Answer & {
        probability: number
        pool: { YES: number; NO: number }
      },
      'prob' | 'poolYes' | 'poolNo'
    >
export type FullMarket = LiteMarket & {
  bets?: Bet[]
  comments?: Comment[]
  answers?: ApiAnswer[]
  description: string | JSONContent
  textDescription: string // string version of description
  coverImageUrl?: string
  groupSlugs?: string[]
}

export function toLiteMarket(contract: Contract): LiteMarket {
  const {
    id,
    creatorId,
    creatorUsername,
    creatorName,
    createdTime,
    creatorAvatarUrl,
    closeTime,
    question,
    slug,
    outcomeType,
    mechanism,
    volume,
    volume24Hours,
    isResolved,
    resolution,
    resolutionTime,
    resolutionProbability,
    uniqueBettorCount,
    lastUpdatedTime,
    lastBetTime,
  } = contract

  const { p, totalLiquidity } = contract as any

  const probability =
    outcomeType === 'BINARY' || outcomeType === 'PSEUDO_NUMERIC'
      ? getProbability(contract)
      : undefined

  let value, min, max, isLogScale: any
  if (contract.outcomeType === 'PSEUDO_NUMERIC') {
    value = getMappedValue(contract, contract.prob)
    ;({ min, max, isLogScale } = contract)
  }

  return removeUndefinedProps({
    id,
    creatorId,
    creatorUsername,
    creatorName,
    createdTime,
    creatorAvatarUrl,
    closeTime:
      resolutionTime && closeTime
        ? Math.min(resolutionTime, closeTime)
        : closeTime,
    question,
    slug,
    url: `https://${DOMAIN}/${creatorUsername}/${slug}`,
    pool: 'pool' in contract ? contract.pool : undefined,
    probability,
    p,
    totalLiquidity,
    outcomeType,
    mechanism,
    volume,
    volume24Hours,
    isResolved,
    resolution,
    resolutionTime,
    resolutionProbability,
    uniqueBettorCount,
    lastUpdatedTime,
    lastBetTime,
    value,
    min,
    max,
    isLogScale,
  })
}

export function toFullMarket(contract: Contract): FullMarket {
  const liteMarket = toLiteMarket(contract)
  const { outcomeType } = contract
  const answers =
    (outcomeType === 'FREE_RESPONSE' || outcomeType === 'MULTIPLE_CHOICE') &&
    contract.answers
      ? contract.answers.map((answer) =>
          augmentAnswerWithProbability(contract, answer)
        )
      : undefined

  const bountyValues =
    outcomeType === 'BOUNTIED_QUESTION'
      ? {
          totalBounty: contract.totalBounty,
          bountyLeft: contract.bountyLeft,
        }
      : {}

  const { description, coverImageUrl, groupSlugs } = contract

  return {
    ...liteMarket,
    ...bountyValues,
    answers,
    description,
    coverImageUrl,
    groupSlugs,
    textDescription:
      typeof description === 'string'
        ? description
        : richTextToString(description),
  }
}

function augmentAnswerWithProbability(
  contract: MultiContract,
  answer: DpmAnswer | Answer
): ApiAnswer {
  const probability = getAnswerProbability(contract, answer.id)
  if (contract.mechanism === 'cpmm-multi-1') {
    const { poolYes, poolNo, prob: _, ...other } = answer as Answer
    const pool = {
      YES: poolYes,
      NO: poolNo,
    }
    return {
      ...other,
      pool,
      probability,
    }
  } else {
    const dpmAnswer = answer as DpmAnswer
    return {
      ...dpmAnswer,
      probability,
    }
  }
}

// ZOD TYPES

// create market

export const createBinarySchema = z.object({
  outcomeType: z.enum(['BINARY', 'STONK']),
  initialProb: z.number().min(1).max(99).optional(),
  extraLiquidity: z.number().min(1).optional(),
})

export const createNumericSchema = z.object({
  outcomeType: z.enum(['PSEUDO_NUMERIC']),
  min: z.number().safe(),
  max: z.number().safe(),
  initialValue: z.number().safe(),
  isLogScale: z.boolean().optional(),
  extraLiquidity: z.number().min(1).optional(),
})

export const createMultiSchema = z.object({
  outcomeType: z.enum(['MULTIPLE_CHOICE']),
  answers: z.array(z.string().trim().min(1)).max(MAX_ANSWERS),
  addAnswersMode: z
    .enum(['DISABLED', 'ONLY_CREATOR', 'ANYONE'])
    .default('DISABLED'),
  shouldAnswersSumToOne: z.boolean().optional(),
  extraLiquidity: z.number().min(1).optional(),
})

export const createBountySchema = z.object({
  outcomeType: z.enum(['BOUNTIED_QUESTION']),
  totalBounty: z.number().min(1),
})

export const createPollSchema = z.object({
  outcomeType: z.enum(['POLL']),
  answers: z.array(z.string().trim().min(1)).min(2).max(MAX_ANSWERS),
})

export const createMarketProps = z
  .object({
    question: z.string().min(1).max(MAX_QUESTION_LENGTH),
    description: contentSchema.or(z.string()).optional(),
    descriptionHtml: z.string().optional(),
    descriptionMarkdown: z.string().optional(),
    descriptionJson: z.string().optional(),
    closeTime: z
      .union([z.date(), z.number()])
      .refine(
        (date) =>
          (typeof date === 'number' ? date : date.getTime()) > Date.now(),
        'Close time must be in the future.'
      )
      .optional(),
    outcomeType: z.enum(CREATEABLE_OUTCOME_TYPES),
    groupIds: z.array(z.string().min(1).max(MAX_ID_LENGTH)).optional(),
    visibility: z.enum(VISIBILITIES).default('public'),
    isTwitchContract: z.boolean().optional(),
    utcOffset: z.number().optional(),
    loverUserId1: z.string().optional(),
    loverUserId2: z.string().optional(),
    matchCreatorId: z.string().optional(),
  })
  .and(
    z.union([
      createMultiSchema,
      createNumericSchema,
      createBountySchema,
      createPollSchema,
      createBinarySchema,
    ])
  )

// resolve market

export const resolveBinarySchema = z
  .object({
    outcome: z.enum(RESOLUTIONS),
    probabilityInt: z.number().gte(0).lte(100).optional(),

    // To resolve one answer of multiple choice. Only independent answers supported (shouldAnswersSumToOne = false)
    answerId: z.string().optional(),
  })
  .passthrough() // overlaps with pseudo-numeric

export const resolveFRSchema = z.union([
  z.object({
    outcome: z.literal('CANCEL'),
  }),
  z.object({
    outcome: z.literal('MKT'),
    resolutions: z.array(
      z.object({
        answer: z.number().int().nonnegative(),
        pct: z.number().gte(0).lte(100),
      })
    ),
  }),
  z.object({
    outcome: z.number().int().nonnegative(),
  }),
])

export const resolveMultiSchema = z.union([
  z.object({
    outcome: z.literal('CANCEL'),
  }),
  z.object({
    outcome: z.literal('CHOOSE_ONE'),
    answerId: z.string(),
  }),
  z.object({
    outcome: z.literal('CHOOSE_MULTIPLE'),
    resolutions: z.array(
      z.object({
        answerId: z.string(),
        pct: z.number().gte(0).lte(100),
      })
    ),
  }),
])

export const resolveNumericSchema = z.object({
  outcome: z.union([z.literal('CANCEL'), z.string()]),
  value: z.number().optional(),
})

export const resolvePseudoNumericSchema = z.union([
  z.object({
    outcome: z.literal('CANCEL'),
  }),
  z.object({
    outcome: z.literal('MKT'),
    value: z.number(),
    probabilityInt: z.number().gte(0).lte(100),
  }),
])

export const resolveMarketProps = z
  .object({
    contractId: z.string(),
  })
  .and(
    z.union([
      resolveBinarySchema,
      resolveMultiSchema,
      resolveFRSchema,
      resolvePseudoNumericSchema,
      resolveNumericSchema,
    ])
  )
