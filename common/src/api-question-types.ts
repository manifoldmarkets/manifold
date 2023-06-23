import { JSONContent } from '@tiptap/core'
import { Answer, DpmAnswer } from 'common/answer'
import { Bet } from 'common/bet'
import { getAnswerProbability, getProbability } from 'common/calculate'
import { Comment } from 'common/comment'
import { Contract, MultiContract } from 'common/contract'
import { DOMAIN } from 'common/envs/constants'
import { removeUndefinedProps } from 'common/util/object'
import { richTextToString } from 'common/util/parse'
import { getMappedValue } from './pseudo-numeric'

export type LiteQuestion = {
  // Unique identifer for this question
  id: string

  // Attributes about the creator
  creatorId: string
  creatorUsername: string
  creatorName: string
  createdTime: number
  creatorAvatarUrl?: string

  // Question attributes. All times are in milliseconds since epoch
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
export type ApiAnswer = (Answer | DpmAnswer) & {
  probability?: number
}
export type FullQuestion = LiteQuestion & {
  bets?: Bet[]
  comments?: Comment[]
  answers?: ApiAnswer[]
  description: string | JSONContent
  textDescription: string // string version of description
  coverImageUrl?: string
}

export function toLiteQuestion(contract: Contract): LiteQuestion {
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

export function toFullQuestion(contract: Contract): FullQuestion {
  const liteQuestion = toLiteQuestion(contract)
  const { outcomeType } = contract
  const answers =
    (outcomeType === 'FREE_RESPONSE' || outcomeType === 'MULTIPLE_CHOICE') &&
    contract.answers
      ? contract.answers.map((answer) =>
          augmentAnswerWithProbability(contract, answer)
        )
      : undefined

  const { description, coverImageUrl } = contract

  return {
    ...liteQuestion,
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
  contract: MultiContract,
  answer: DpmAnswer | Answer
): ApiAnswer {
  const probability = getAnswerProbability(contract, answer.id)
  return {
    ...answer,
    probability,
  }
}
