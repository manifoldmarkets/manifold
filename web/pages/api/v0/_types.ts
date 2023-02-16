import { Bet } from 'common/bet'
import { Answer } from 'common/answer'
import { getOutcomeProbability, getProbability } from 'common/calculate'
import { Comment } from 'common/comment'
import { Contract } from 'common/contract'
import { User } from 'common/user'
import { removeUndefinedProps } from 'common/util/object'
import { DOMAIN, ENV_CONFIG } from 'common/envs/constants'
import { JSONContent } from '@tiptap/core'
import { richTextToString } from 'common/util/parse'

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

export type ApiAnswer = Answer & {
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

export type ApiError = {
  error: string
}

type ValidationErrorDetail = {
  field: string | null
  error: string
}
export class ValidationError {
  details: ValidationErrorDetail[]

  constructor(details: ValidationErrorDetail[]) {
    this.details = details
  }
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
    contract.outcomeType === 'BINARY' ? getProbability(contract) : undefined

  let min, max, isLogScale: any
  if (contract.outcomeType === 'PSEUDO_NUMERIC') {
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
    textDescription:
      typeof description === 'string'
        ? description
        : richTextToString(description),
    coverImageUrl,
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
}

export function toLiteUser(user: User): LiteUser {
  const {
    id,
    createdTime,
    name,
    username,
    avatarUrl,
    bio,
    website,
    twitterHandle,
    discordHandle,
    balance,
    totalDeposits,
    profitCached,
  } = user

  return removeUndefinedProps({
    id,
    createdTime,
    name,
    username,
    url: `https://${ENV_CONFIG.domain}/${username}`,
    avatarUrl,
    bio,
    website,
    twitterHandle,
    discordHandle,
    balance,
    totalDeposits,
    profitCached,
  })
}
