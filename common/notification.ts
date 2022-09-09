import { notification_subscription_types } from 'common/user'

export type Notification = {
  id: string
  userId: string
  reasonText?: string
  reason?: notification_reason_types
  createdTime: number
  viewTime?: number
  isSeen: boolean

  sourceId?: string
  sourceType?: notification_source_types
  sourceUpdateType?: notification_source_update_types
  sourceContractId?: string
  sourceUserName?: string
  sourceUserUsername?: string
  sourceUserAvatarUrl?: string
  sourceText?: string
  data?: string

  sourceContractTitle?: string
  sourceContractCreatorUsername?: string
  sourceContractSlug?: string

  sourceSlug?: string
  sourceTitle?: string

  isSeenOnHref?: string
}
export type notification_source_types =
  | 'contract'
  | 'comment'
  | 'bet'
  | 'answer'
  | 'liquidity'
  | 'follow'
  | 'tip'
  | 'admin_message'
  | 'group'
  | 'user'
  | 'bonus'
  | 'challenge'
  | 'betting_streak_bonus'
  | 'loan'
  | 'like'
  | 'tip_and_like'

export type notification_source_update_types =
  | 'created'
  | 'updated'
  | 'resolved'
  | 'deleted'
  | 'closed'

export type notification_reason_types =
  | 'tagged_user'
  | 'on_new_follow'
  | 'contract_from_followed_user'
  | 'you_referred_user'
  | 'user_joined_to_bet_on_your_market'
  | 'unique_bettors_on_your_contract'
  | 'tip_received'
  | 'bet_fill'
  | 'user_joined_from_your_group_invite'
  | 'challenge_accepted'
  | 'betting_streak_incremented'
  | 'loan_income'
  | 'liked_and_tipped_your_contract'
  | 'comment_on_your_contract'
  | 'answer_on_your_contract'
  | 'comment_on_contract_you_follow'
  | 'answer_on_contract_you_follow'
  | 'update_on_contract_you_follow'
  | 'resolution_on_contract_you_follow'
  | 'comment_on_contract_with_users_shares_in'
  | 'answer_on_contract_with_users_shares_in'
  | 'update_on_contract_with_users_shares_in'
  | 'resolution_on_contract_with_users_shares_in'
  | 'comment_on_contract_with_users_answer'
  | 'update_on_contract_with_users_answer'
  | 'resolution_on_contract_with_users_answer'
  | 'answer_on_contract_with_users_answer'
  | 'comment_on_contract_with_users_comment'
  | 'answer_on_contract_with_users_comment'
  | 'update_on_contract_with_users_comment'
  | 'resolution_on_contract_with_users_comment'
  | 'reply_to_users_answer'
  | 'reply_to_users_comment'
  | 'your_contract_closed'
  | 'subsidized_your_market'

// Adding a new key:value here is optional, you can also just use a key of exhaustive_notification_subscribe_types
export const notificationReasonToSubscriptionType: Partial<
  Record<notification_reason_types, keyof notification_subscription_types>
> = {
  you_referred_user: 'referral_bonuses',
  user_joined_to_bet_on_your_market: 'referral_bonuses',
  tip_received: 'tips_on_your_comments',
  bet_fill: 'limit_order_fills',
  user_joined_from_your_group_invite: 'referral_bonuses',
  challenge_accepted: 'limit_order_fills',
  betting_streak_incremented: 'betting_streaks',
  liked_and_tipped_your_contract: 'tips_on_your_markets',
  comment_on_your_contract: 'all_comments_on_my_markets',
  answer_on_your_contract: 'all_answers_on_my_markets',
  comment_on_contract_you_follow: 'all_comments_on_watched_markets',
  answer_on_contract_you_follow: 'all_answers_on_watched_markets',
  update_on_contract_you_follow: 'market_updates_on_watched_markets',
  resolution_on_contract_you_follow: 'resolutions_on_watched_markets',
  comment_on_contract_with_users_shares_in:
    'all_comments_on_contracts_with_shares_in_on_watched_markets',
  answer_on_contract_with_users_shares_in:
    'all_answers_on_contracts_with_shares_in_on_watched_markets',
  update_on_contract_with_users_shares_in:
    'market_updates_on_watched_markets_with_shares_in',
  resolution_on_contract_with_users_shares_in:
    'resolutions_on_watched_markets_with_shares_in',
  comment_on_contract_with_users_answer: 'all_comments_on_watched_markets',
  update_on_contract_with_users_answer: 'market_updates_on_watched_markets',
  resolution_on_contract_with_users_answer: 'resolutions_on_watched_markets',
  answer_on_contract_with_users_answer: 'all_answers_on_watched_markets',
  comment_on_contract_with_users_comment: 'all_comments_on_watched_markets',
  answer_on_contract_with_users_comment: 'all_answers_on_watched_markets',
  update_on_contract_with_users_comment: 'market_updates_on_watched_markets',
  resolution_on_contract_with_users_comment: 'resolutions_on_watched_markets',
  reply_to_users_answer: 'all_replies_to_my_answers_on_watched_markets',
  reply_to_users_comment: 'all_replies_to_my_comments_on_watched_markets',
}
