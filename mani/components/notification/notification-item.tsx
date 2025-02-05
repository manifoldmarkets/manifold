import { Notification, ReactionNotificationTypes } from 'common/notification'
import { PushNotificationBonusNotification } from './types/push-notification-bonus'
import { QuestIncomeNotification } from './types/quest-income'
import { BettingStreakBonusIncomeNotification } from './types/betting-streak-bonus-income'
import { BettingStreakExpiringNotification } from './types/betting-streak-expiring'
import { PaymentSuccessNotification } from './types/payment-success'
import { ReferralNotification } from './types/referral'
import { BetFillNotification } from './types/bet-fill'
import { CommentNotification } from './types/comment'
import { TaggedUserNotification } from './types/tagged-user'
import { MarketResolvedNotification } from './types/market-closed'
import { SignupBonusNotification } from './types/signup-bonus'
import { UserLikeNotification } from './types/user-like'
import { NotificationFrame } from './notification-frame'
import { extractTextFromContent } from 'components/content/content-utils'
import { truncateText } from 'lib/truncate-text'
import { LogoAvatar } from 'components/ui/logo-avatar'

// export const ignoredReasons = [
//   'unique_bettors_on_your_contract',
//   'loan_income',
//   'mana_payment_received',
//   'bounty_added',
//   'bounty_canceled',
//   'limit_order_cancelled',
//   'contract_from_followed_user',
//   'bounty_awarded',
//   'vote_on_your_contract',
//   'all_votes_on_watched_markets',
//   'poll_close_on_watched_markets',
//   'your_poll_closed',
//   'on_new_follow',
//   'league_changed',
//   'subsidized_your_market',
//   'profit_loss_updates',
//   'onboarding_flow',
//   'review_on_your_market',
//   'airdrop',
//   'manifest_airdrop',
//   'extra_purchased_mana',
//   'your_contract_closed',
// ]

// export const ignoredSourceTypes = [
//   'bet_reply',
//   'answer',
//   'referral_program',
//   'follow_suggestion',
// ]

// export function shouldIgnoreNotification(notification: Notification) {
//   const { sourceType, reason, sourceUpdateType } = notification
//   if (
//     ignoredReasons.includes(reason) ||
//     ignoredSourceTypes.includes(sourceType) ||
//     (ReactionNotificationTypes.includes(sourceType) &&
//       sourceType != 'comment_like')
//   ) {
//     return true
//   }
//   return false
// }

export function NotificationItem({
  notification,
  isChildOfGroup,
}: {
  notification: Notification
  isChildOfGroup?: boolean
}) {
  const { sourceType, reason, sourceUpdateType, sourceText, reasonText } =
    notification
  const defaultText = sourceText ?? reasonText ?? null

  // if (
  //   ignoredReasons.includes(reason) ||
  //   ignoredSourceTypes.includes(sourceType)
  // ) {
  //   return null
  // }

  // TODO: make this filtering in the backend

  if (sourceType == 'push_notification_bonus') {
    return (
      <PushNotificationBonusNotification
        notification={notification}
        isChildOfGroup={isChildOfGroup}
      />
    )
  } else if (sourceType == 'quest_reward') {
    return (
      <QuestIncomeNotification
        notification={notification}
        isChildOfGroup={isChildOfGroup}
      />
    )
  } else if (sourceType === 'betting_streak_bonus') {
    return (
      <BettingStreakBonusIncomeNotification
        notification={notification}
        isChildOfGroup={isChildOfGroup}
      />
    )
  } else if (sourceType === 'betting_streak_expiring') {
    return (
      <BettingStreakExpiringNotification
        notification={notification}
        isChildOfGroup={isChildOfGroup}
      />
    )
  } else if (reason === 'payment_status') {
    return (
      <PaymentSuccessNotification
        notification={notification}
        isChildOfGroup={isChildOfGroup}
      />
    )
  } else if (sourceType === 'user' && sourceUpdateType === 'updated') {
    return (
      <ReferralNotification
        notification={notification}
        isChildOfGroup={isChildOfGroup}
      />
    )
  } else if (reason === 'bet_fill') {
    return (
      <BetFillNotification
        notification={notification}
        isChildOfGroup={isChildOfGroup}
      />
    )
    // ignoring limit order cancelled and expired for now
  } else if (sourceType === 'comment') {
    return (
      <CommentNotification
        notification={notification}
        isChildOfGroup={isChildOfGroup}
      />
    )
  } else if (reason === 'tagged_user') {
    return (
      <TaggedUserNotification
        notification={notification}
        isChildOfGroup={isChildOfGroup}
      />
    )
  } else if (sourceType === 'contract' && sourceUpdateType === 'updated') {
    return null
  } else if (sourceType === 'contract' && sourceUpdateType === 'resolved') {
    return (
      <MarketResolvedNotification
        notification={notification}
        isChildOfGroup={isChildOfGroup}
      />
    )
  } else if (
    (sourceType === 'contract' || sourceType === 'love_contract') &&
    sourceUpdateType === 'closed'
  ) {
    return null
  } else if (sourceType === 'signup_bonus') {
    return (
      <SignupBonusNotification
        notification={notification}
        isChildOfGroup={isChildOfGroup}
      />
    )
  } else if (ReactionNotificationTypes.includes(sourceType)) {
    return (
      <UserLikeNotification
        notification={notification}
        isChildOfGroup={isChildOfGroup}
      />
    )
  }
  if (defaultText) {
    return (
      <NotificationFrame
        notification={notification}
        isChildOfGroup={isChildOfGroup}
        icon={<LogoAvatar size="md" />}
      >
        <>{truncateText(extractTextFromContent(defaultText), '2xl')}</>
      </NotificationFrame>
    )
  }
  return null
}
