import { Bet } from 'common/bet'
import { Answer } from 'common/answer'
import { getOutcomeProbability, getProbability } from 'common/calculate'
import { Comment } from 'common/comment'
import { Contract } from 'common/contract'
import { removeUndefinedProps } from 'common/util/object'

export type LiteMarket = {
  // Unique identifer for this market
  id: string

  // Attributes about the creator
  creatorUsername: string
  creatorName: string
  createdTime: number
  creatorAvatarUrl?: string

  // Market attributes. All times are in milliseconds since epoch
  closeTime?: number
  question: string
  description: string
  tags: string[]
  url: string
  outcomeType: string
  mechanism: string

  pool: number
  probability?: number
  p?: number
  totalLiquidity?: number

  volume: number
  volume7Days: number
  volume24Hours: number

  isResolved: boolean
  resolution?: string
  resolutionTime?: number
}

export type ApiAnswer = Answer & {
  probability?: number
}

export type FullMarket = LiteMarket & {
  bets: Bet[]
  comments: Comment[]
  answers?: ApiAnswer[]
}

export type ApiError = {
  error: string
}

export function toLiteMarket(contract: Contract): LiteMarket {
  const {
    id,
    creatorUsername,
    creatorName,
    createdTime,
    creatorAvatarUrl,
    closeTime,
    question,
    description,
    tags,
    slug,
    pool,
    outcomeType,
    mechanism,
    volume,
    volume7Days,
    volume24Hours,
    isResolved,
    resolution,
    resolutionTime,
  } = contract

  const { p, totalLiquidity } = contract as any

  const probability =
    contract.outcomeType === 'BINARY' ? getProbability(contract) : undefined

  return removeUndefinedProps({
    id,
    creatorUsername,
    creatorName,
    createdTime,
    creatorAvatarUrl,
    closeTime:
      resolutionTime && closeTime
        ? Math.min(resolutionTime, closeTime)
        : closeTime,
    question,
    description,
    tags,
    url: `https://manifold.markets/${creatorUsername}/${slug}`,
    pool: pool.YES + pool.NO,
    probability,
    p,
    totalLiquidity,
    outcomeType,
    mechanism,
    volume,
    volume7Days,
    volume24Hours,
    isResolved,
    resolution,
    resolutionTime,
  })
}

export function toFullMarket(
  contract: Contract,
  comments: Comment[],
  bets: Bet[]
): FullMarket {
  const liteMarket = toLiteMarket(contract)
  const answers =
    contract.outcomeType === 'FREE_RESPONSE'
      ? contract.answers.map((answer) =>
          augmentAnswerWithProbability(contract, answer)
        )
      : undefined

  return {
    ...liteMarket,
    answers,
    comments,
    bets,
  }
}

function augmentAnswerWithProbability(
  contract: Contract,
  answer: Answer
): ApiAnswer {
  const probability = getOutcomeProbability(contract, answer.id)
  return {
    ...answer,
    probability,
  }
}
