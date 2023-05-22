import { JSONContent } from '@tiptap/core'
import { DpmAnswer } from 'common/answer'
import { Bet } from 'common/bet'
import { getOutcomeProbability, getProbability } from 'common/calculate'
import { Comment } from 'common/comment'
import { Contract } from 'common/contract'
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
  tags: string[]
  url: string
  outcomeType: string
  mechanism: string

  pool: { [outcome: string]: number }
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
export type ApiAnswer = DpmAnswer & {
  probability?: number
}
export type FullMarket = LiteMarket & {
  bets?: Bet[]
  comments?: Comment[]
  answers?: ApiAnswer[]
  description: string | JSONContent
  textDescription: string // string version of description
  coverImageUrl?: string
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
    tags,
    slug,
    pool,
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
    tags,
    url: `https://${DOMAIN}/${creatorUsername}/${slug}`,
    pool,
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
  const answers =
    contract.outcomeType === 'FREE_RESPONSE' ||
    contract.outcomeType === 'MULTIPLE_CHOICE'
      ? contract.answers.map((answer) =>
          augmentAnswerWithProbability(contract, answer)
        )
      : undefined

  const { description, coverImageUrl } = contract

  return {
    ...liteMarket,
    answers,
    description,
    coverImageUrl,
    textDescription:
      typeof description === 'string'
        ? description
        : richTextToString(description),
  }
}

function augmentAnswerWithProbability(
  contract: Contract,
  answer: DpmAnswer
): ApiAnswer {
  const probability = getOutcomeProbability(contract, answer.id)
  return {
    ...answer,
    probability,
  }
}
