import { Contract } from 'common/contract'
import { ContractComment } from 'common/comment'
import { Repost } from 'common/repost'
import { Bet } from 'common/bet'

export type FeedContract = {
  contract: Contract
  topicConversionScore: number
  adId?: string
  comment?: ContractComment
  repost?: Repost
  bet?: Bet
}

// Technically we were trying to record earlier, but there was a sneaky bug with view recordings
export const VIEW_RECORDINGS_START = 1716917400000

export const FEED_CARD_HITS = 5
export const FEED_CARD_MISSES = 5
export const FEED_BETA_LOSS = 5 // 5x worse to show a miss above a hit
export const GROUP_SCORE_PRIOR = 0.34698192227708463 // betaIncompleteInverse(1/6, 5, 5)
export const FOLLOWED_TOPIC_CONVERSION_PRIOR = 1
export const NEW_USER_FOLLOWED_TOPIC_SCORE_BOOST = 0.7
export const OLD_USER_FOLLOWED_TOPIC_SCORE_BOOST = 0.3

// 70/30 max/avg blend across a market's matching tags — keeps a strong
// niche match from being diluted by broad parent tags also on the market.
export const NICHE_BLEND_TOPIC_SCORE_SQL =
  '(0.7 * max(uti.topic_score) + 0.3 * avg(uti.topic_score))'
