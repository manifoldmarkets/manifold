import { Bet } from '../../../../common/bet'
import { getProbability } from '../../../../common/calculate'
import { Comment } from '../../../../common/comment'
import { Contract } from '../../../../common/contract'

export type LiteContract = {
  id: string
  creatorUsername: string
  creatorName: string
  createdTime: number
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
}

export type FullContract = LiteContract & {
  bets: Bet[]
  comments: Comment[]
}

export type ApiError = {
  error: string
}

export function toLiteContract({
  id,
  creatorUsername,
  creatorName,
  createdTime,
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
}: Contract): LiteContract {
  return {
    id,
    creatorUsername,
    creatorName,
    createdTime,
    closeTime,
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
  }
}
