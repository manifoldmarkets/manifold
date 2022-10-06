import { notification_preference } from './user-notification-preferences'

export type Notification = {
  id: string
  userId: string
  reasonText?: string
  reason?: notification_reason_types | notification_preference
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
  data?: { [key: string]: any }

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
  | 'badge'

export type notification_source_update_types =
  | 'created'
  | 'updated'
  | 'resolved'
  | 'deleted'
  | 'closed'

/* Optional - if possible use a notification_preference */
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

type notification_descriptions = {
  [key in notification_preference]: {
    simple: string
    detailed: string
  }
}
export const NOTIFICATION_DESCRIPTIONS: notification_descriptions = {
  all_answers_on_my_markets: {
    simple: 'Answers on your markets',
    detailed: 'Answers on your own markets',
  },
  all_comments_on_my_markets: {
    simple: 'Comments on your markets',
    detailed: 'Comments on your own markets',
  },
  answers_by_followed_users_on_watched_markets: {
    simple: 'Only answers by users you follow',
    detailed: "Only answers by users you follow on markets you're watching",
  },
  answers_by_market_creator_on_watched_markets: {
    simple: 'Only answers by market creator',
    detailed: "Only answers by market creator on markets you're watching",
  },
  betting_streaks: {
    simple: 'For predictions made over consecutive days',
    detailed: 'Bonuses for predictions made over consecutive days',
  },
  comments_by_followed_users_on_watched_markets: {
    simple: 'Only comments by users you follow',
    detailed:
      'Only comments by users that you follow on markets that you watch',
  },
  contract_from_followed_user: {
    simple: 'New markets from users you follow',
    detailed: 'New markets from users you follow',
  },
  limit_order_fills: {
    simple: 'Limit order fills',
    detailed: 'When your limit order is filled by another user',
  },
  loan_income: {
    simple: 'Automatic loans from your predictions in unresolved markets',
    detailed:
      'Automatic loans from your predictions that are locked in unresolved markets',
  },
  market_updates_on_watched_markets: {
    simple: 'All creator updates',
    detailed: 'All market updates made by the creator',
  },
  market_updates_on_watched_markets_with_shares_in: {
    simple: "Only creator updates on markets that you're invested in",
    detailed:
      "Only updates made by the creator on markets that you're invested in",
  },
  on_new_follow: {
    simple: 'A user followed you',
    detailed: 'A user followed you',
  },
  onboarding_flow: {
    simple: 'Emails to help you get started using Manifold',
    detailed: 'Emails to help you learn how to use Manifold',
  },
  probability_updates_on_watched_markets: {
    simple: 'Large changes in probability on markets that you watch',
    detailed: 'Large changes in probability on markets that you watch',
  },
  profit_loss_updates: {
    simple: 'Weekly profit and loss updates',
    detailed: 'Weekly profit and loss updates',
  },
  referral_bonuses: {
    simple: 'For referring new users',
    detailed: 'Bonuses you receive from referring a new user',
  },
  resolutions_on_watched_markets: {
    simple: 'All market resolutions',
    detailed: "All resolutions on markets that you're watching",
  },
  resolutions_on_watched_markets_with_shares_in: {
    simple: "Only market resolutions that you're invested in",
    detailed:
      "Only resolutions of markets you're watching and that you're invested in",
  },
  subsidized_your_market: {
    simple: 'Your market was subsidized',
    detailed: 'When someone subsidizes your market',
  },
  tagged_user: {
    simple: 'A user tagged you',
    detailed: 'When another use tags you',
  },
  thank_you_for_purchases: {
    simple: 'Thank you notes for your purchases',
    detailed: 'Thank you notes for your purchases',
  },
  tipped_comments_on_watched_markets: {
    simple: 'Only highly tipped comments on markets that you watch',
    detailed: 'Only highly tipped comments on markets that you watch',
  },
  tips_on_your_comments: {
    simple: 'Tips on your comments',
    detailed: 'Tips on your comments',
  },
  tips_on_your_markets: {
    simple: 'Tips/Likes on your markets',
    detailed: 'Tips/Likes on your markets',
  },
  trending_markets: {
    simple: 'Weekly interesting markets',
    detailed: 'Weekly interesting markets',
  },
  unique_bettors_on_your_contract: {
    simple: 'For unique predictors on your markets',
    detailed: 'Bonuses for unique predictors on your markets',
  },
  your_contract_closed: {
    simple: 'Your market has closed and you need to resolve it',
    detailed: 'Your market has closed and you need to resolve it',
  },
  all_comments_on_watched_markets: {
    simple: 'All new comments',
    detailed: 'All new comments on markets you follow',
  },
  all_comments_on_contracts_with_shares_in_on_watched_markets: {
    simple: `Only on markets you're invested in`,
    detailed: `Comments on markets that you're watching and you're invested in`,
  },
  all_replies_to_my_comments_on_watched_markets: {
    simple: 'Only replies to your comments',
    detailed: "Only replies to your comments on markets you're watching",
  },
  all_replies_to_my_answers_on_watched_markets: {
    simple: 'Only replies to your answers',
    detailed: "Only replies to your answers on markets you're watching",
  },
  all_answers_on_watched_markets: {
    simple: 'All new answers',
    detailed: "All new answers on markets you're watching",
  },
  all_answers_on_contracts_with_shares_in_on_watched_markets: {
    simple: `Only on markets you're invested in`,
    detailed: `Answers on markets that you're watching and that you're invested in`,
  },
  badges_awarded: {
    simple: 'New badges awarded',
    detailed: 'New badges you have earned',
  },
}

export type BettingStreakData = {
  streak: number
  bonusAmount: number
}

export type BetFillData = {
  betOutcome: string
  creatorOutcome: string
  probability: number
  fillAmount: number
  limitOrderTotal?: number
  limitOrderRemaining?: number
}

export type ContractResolutionData = {
  outcome: string
  userPayout: number
  userInvestment: number
}
