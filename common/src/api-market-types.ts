import { JSONContent } from '@tiptap/core'
import { Except } from 'type-fest'
import { Answer, DpmAnswer } from 'common/answer'
import { Bet } from 'common/bet'
import { getAnswerProbability, getProbability } from 'common/calculate'
import { Comment } from 'common/comment'
import { Contract, MultiContract } from 'common/contract'
import { DOMAIN } from 'common/envs/constants'
import { removeUndefinedProps } from 'common/util/object'
import { richTextToString } from 'common/util/parse'
import { getMappedValue } from './pseudo-numeric'

export type LiteMarket = {
  // Unique identifer for this market
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
  url: string
  outcomeType: string
  mechanism: string

  pool?: { [outcome: string]: number }
  probability?: number
  p?: number
  totalLiquidity?: number

  volume: number
  volume24Hours: number

  isResolved: boolean
  resolution?: string
  resolutionTime?: number
  resolutionProbability?: number

  lastUpdatedTime?: number
}
export type ApiAnswer =
  | (DpmAnswer & {
      probability: number
    })
  | Except<
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
    lastUpdatedTime,
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
    lastUpdatedTime,
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

  const { description, coverImageUrl, groupSlugs } = contract

  return {
    ...liteMarket,
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
