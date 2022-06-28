import { Bet } from 'common/bet'
import { Answer } from 'common/answer'
import { getOutcomeProbability, getProbability } from 'common/calculate'
import { Comment } from 'common/comment'
import { Contract } from 'common/contract'
import { User } from 'common/user'
import { removeUndefinedProps } from 'common/util/object'
import { ENV_CONFIG } from 'common/envs/constants'

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

  pool: { [outcome: string]: number }
  probability?: number
  p?: number
  totalLiquidity?: number

  volume: number
  volume7Days: number
  volume24Hours: number

  isResolved: boolean
  resolution?: string
  resolutionTime?: number
  resolutionProbability?: number
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
    resolutionProbability,
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
    pool,
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
    resolutionProbability,
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

export type LiteUser = {
  id: string
  createdTime: number

  name: string
  username: string
  url: string
  avatarUrl?: string

  bio?: string
  bannerUrl?: string
  website?: string
  twitterHandle?: string
  discordHandle?: string

  balance: number
  totalDeposits: number

  profitCached: {
    daily: number
    weekly: number
    monthly: number
    allTime: number
  }

  creatorVolumeCached: {
    daily: number
    weekly: number
    monthly: number
    allTime: number
  }
}

export function toLiteUser(user: User): LiteUser {
  const {
    id,
    createdTime,
    name,
    username,
    avatarUrl,
    bio,
    bannerUrl,
    website,
    twitterHandle,
    discordHandle,
    balance,
    totalDeposits,
    profitCached,
    creatorVolumeCached,
  } = user

  return removeUndefinedProps({
    id,
    createdTime,
    name,
    username,
    url: `https://${ENV_CONFIG.domain}/${username}`,
    avatarUrl,
    bio,
    bannerUrl,
    website,
    twitterHandle,
    discordHandle,
    balance,
    totalDeposits,
    profitCached,
    creatorVolumeCached,
  })
}
