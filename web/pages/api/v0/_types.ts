import { Bet } from '../../../../common/bet'
import { getProbability } from '../../../../common/calculate'
import { Comment } from '../../../../common/comment'
import { Contract } from '../../../../common/contract'

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

  pool: number
  probability: number
  volume7Days: number
  volume24Hours: number
  isResolved: boolean
  resolution?: string
  resolutionTime?: number
}

export type FullMarket = LiteMarket & {
  bets: Exclude<Bet, 'userId'>[]
  comments: Comment[]
}

export type ApiError = {
  error: string
}

export function toLiteMarket({
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
  totalShares,
  volume7Days,
  volume24Hours,
  isResolved,
  resolution,
  resolutionTime,
}: Contract): LiteMarket {
  return {
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
    probability: getProbability(totalShares),
    volume7Days,
    volume24Hours,
    isResolved,
    resolution,
    resolutionTime,
  }
}
