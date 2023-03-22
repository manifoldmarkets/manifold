import { outcomeType } from 'common/contract'
import { groupPath } from './group'
import { PAST_BET } from './user'
import { notification_preference } from './user-notification-preferences'

export type Notification = {
  id: string
  userId: string
  reasonText?: string
  reason: NotificationReason
  createdTime: number
  viewTime?: number
  isSeen: boolean

  sourceId: string
  sourceType: notification_source_types
  sourceUpdateType?: notification_source_update_types

  // sourceContractId is used to group notifications on the same contract together
  sourceContractId?: string
  sourceUserName: string
  sourceUserUsername: string
  sourceUserAvatarUrl: string
  sourceText: string
  data?: { [key: string]: any }

  sourceContractTitle?: string
  sourceContractCreatorUsername?: string
  sourceContractSlug?: string

  sourceSlug?: string
  sourceTitle?: string

  isSeenOnHref?: string
}

export type NotificationReason =
  | notification_reason_types
  | notification_preference

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
  | 'tip_and_like'
  | 'badge'
  | 'signup_bonus'
  | 'comment_like'
  | 'contract_like'
  | 'weekly_portfolio_update'
  | 'quest_reward'

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
  | 'group_role_changed'
  | 'added_to_group'

type notification_descriptions = {
  [key in notification_preference]: {
    simple: string
    detailed: string
    necessary?: boolean
    verb?: string
  }
}
export const NOTIFICATION_DESCRIPTIONS: notification_descriptions = {
  all_answers_on_my_markets: {
    simple: 'Answers on your markets',
    detailed: 'Answers on your own markets',
    verb: 'answered your question',
  },
  some_comments_on_watched_markets: {
    simple: 'Popular comments on markets you watch',
    detailed: 'Comments on markets you watch that other users have liked',
  },
  all_comments_on_my_markets: {
    simple: 'Comments on your markets',
    detailed: 'Comments on your own markets',
    verb: 'commented on your market',
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
    simple: `For prediction streaks`,
    detailed: `Bonuses for predictions made over consecutive days (Prediction streaks))`,
  },
  quest_payout: {
    simple: `For quest completion rewards`,
    detailed: `Bonuses paid out for completing quests`,
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
    simple: `Only creator updates on markets that you've ${PAST_BET}`,
    detailed: `Only updates made by the creator on markets that you've ${PAST_BET}`,
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
    simple: 'Weekly portfolio updates',
    detailed: 'Weekly portfolio updates',
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
    simple: `Only market resolutions that you've ${PAST_BET}`,
    detailed: `Only resolutions of markets you're watching and that you've ${PAST_BET}`,
  },
  subsidized_your_market: {
    simple: 'Your market was subsidized',
    detailed: 'When someone subsidizes your market',
  },
  tagged_user: {
    simple: 'A user tagged you',
    detailed: 'When another use tags you',
    verb: 'tagged you',
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
    simple: 'Your market has closed and you need to resolve it (necessary)',
    detailed: 'Your market has closed and you need to resolve it (necessary)',
    necessary: true,
  },
  all_comments_on_watched_markets: {
    simple: 'All new comments',
    detailed: 'All new comments on markets you follow',
  },
  all_comments_on_contracts_with_shares_in_on_watched_markets: {
    simple: `Only on markets you've ${PAST_BET}`,
    detailed: `Comments on markets that you're watching and you've ${PAST_BET}`,
  },
  all_replies_to_my_comments_on_watched_markets: {
    simple: 'Only replies to your comments',
    detailed: "Only replies to your comments on markets you're watching",
    verb: 'replied to you',
  },
  all_replies_to_my_answers_on_watched_markets: {
    simple: 'Only replies to your answers',
    detailed: "Only replies to your answers on markets you're watching",
    verb: 'replied to you',
  },
  all_answers_on_watched_markets: {
    simple: 'All new answers',
    detailed: "All new answers on markets you're watching",
  },
  all_answers_on_contracts_with_shares_in_on_watched_markets: {
    simple: `Only on markets you've ${PAST_BET}`,
    detailed: `Answers on markets that you're watching and that you've ${PAST_BET}`,
  },
  opt_out_all: {
    simple: 'Opt out of all notifications (excludes when your markets close)',
    detailed:
      'Opt out of all notifications excluding your own market closure notifications',
  },
  user_liked_your_content: {
    simple: 'A user liked your content',
    detailed: 'A user liked your comment, market, or other content',
  },
  group_role_changed: {
    simple: 'Changes in group roles',
    detailed: 'Changes to your role in groups you are a member of',
  },
  added_to_group: {
    simple: 'Getting added to new groups',
    detailed: 'When an admin adds you to their group',
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
  limitAt?: string
  outcomeType?: outcomeType
}

export type ContractResolutionData = {
  outcome: string
  userPayout: number
  userInvestment: number
  profitRank?: number
  totalShareholders?: number
  profit?: number
}

export function getSourceIdForLinkComponent(
  sourceId: string,
  sourceType?: notification_source_types
) {
  switch (sourceType) {
    case 'answer':
      return `answer-${sourceId}`
    case 'comment':
      return sourceId
    case 'contract':
      return ''
    case 'bet':
      return ''
    default:
      return sourceId
  }
}

export function getSourceUrl(notification: Notification) {
  const {
    sourceType,
    sourceId,
    sourceUserUsername,
    sourceContractCreatorUsername,
    sourceContractSlug,
    sourceSlug,
  } = notification
  if (sourceType === 'weekly_portfolio_update')
    return `/week/${sourceUserUsername}/${sourceSlug}`
  if (sourceType === 'follow') return `/${sourceUserUsername}`
  if (sourceType === 'group' && sourceSlug) return `${groupPath(sourceSlug)}`
  // User referral via contract:
  if (
    sourceContractCreatorUsername &&
    sourceContractSlug &&
    sourceType === 'user'
  )
    return `/${sourceContractCreatorUsername}/${sourceContractSlug}`
  // User referral:
  if (sourceType === 'user' && !sourceContractSlug)
    return `/${sourceUserUsername}`
  if (
    sourceType === 'challenge' ||
    ReactionNotificationTypes.includes(sourceType)
  )
    return `${sourceSlug}`
  if (sourceContractCreatorUsername && sourceContractSlug)
    return `/${sourceContractCreatorUsername}/${sourceContractSlug}#${getSourceIdForLinkComponent(
      sourceId ?? '',
      sourceType
    )}`
  else if (sourceSlug)
    return `${
      sourceSlug.startsWith('/') ? sourceSlug : '/' + sourceSlug
    }#${getSourceIdForLinkComponent(sourceId ?? '', sourceType)}`

  return ''
}

export const ReactionNotificationTypes: Partial<notification_source_types>[] = [
  'comment_like',
  'contract_like',
]

export const BalanceChangeNotificationTypes: NotificationReason[] = [
  'loan_income',
  // bonuses
  'betting_streak_incremented',
  'unique_bettors_on_your_contract',
  // resolutions
  'resolution_on_contract_with_users_shares_in',
  // referrals
  'you_referred_user',
  'user_joined_to_bet_on_your_market',
  'user_joined_from_your_group_invite',
  'quest_payout',
]
