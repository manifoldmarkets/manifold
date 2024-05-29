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
