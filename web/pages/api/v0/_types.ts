import { Bet } from 'common/bet'
import { getProbability } from 'common/calculate'
import { Comment } from 'common/comment'
import { Contract, DPM } from 'common/contract'
import { removeUndefinedProps } from 'common/util/object'
import { sum } from 'lodash'
import { getPoolValue } from 'web/lib/firebase/contracts'

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
  totalShares?: number

  volume: number
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
    outcomeType,
    mechanism,
    volume,
    volume7Days,
    volume24Hours,
    isResolved,
    resolution,
    resolutionTime,
  } = contract

  const { p } = contract as any

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
    pool: getPoolValue(contract),
    probability,
    p,
    totalShares: getTotalShares(contract),
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

function getTotalShares(contract: Contract): number {
  const shares =
    contract.mechanism === 'dpm-2' ? contract.totalShares : contract.pool

  return sum(Object.values(shares))
}
