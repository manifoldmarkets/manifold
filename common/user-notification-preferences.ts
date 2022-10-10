import { filterDefined } from './util/array'
import { notification_reason_types } from './notification'
import { getFunctionUrl } from './api'
import { DOMAIN } from './envs/constants'
import { PrivateUser } from './user'

export type notification_destination_types = 'email' | 'browser'
export type notification_preference = keyof notification_preferences
export type notification_preferences = {
  // Watched Markets
  all_comments_on_watched_markets: notification_destination_types[]
  all_answers_on_watched_markets: notification_destination_types[]

  // Comments
  tipped_comments_on_watched_markets: notification_destination_types[]
  comments_by_followed_users_on_watched_markets: notification_destination_types[]
  all_replies_to_my_comments_on_watched_markets: notification_destination_types[]
  all_replies_to_my_answers_on_watched_markets: notification_destination_types[]
  all_comments_on_contracts_with_shares_in_on_watched_markets: notification_destination_types[]

  // Answers
  answers_by_followed_users_on_watched_markets: notification_destination_types[]
  answers_by_market_creator_on_watched_markets: notification_destination_types[]
  all_answers_on_contracts_with_shares_in_on_watched_markets: notification_destination_types[]

  // On users' markets
  your_contract_closed: notification_destination_types[]
  all_comments_on_my_markets: notification_destination_types[]
  all_answers_on_my_markets: notification_destination_types[]
  subsidized_your_market: notification_destination_types[]

  // Market updates
  resolutions_on_watched_markets: notification_destination_types[]
  resolutions_on_watched_markets_with_shares_in: notification_destination_types[]
  market_updates_on_watched_markets: notification_destination_types[]
  market_updates_on_watched_markets_with_shares_in: notification_destination_types[]
  probability_updates_on_watched_markets: notification_destination_types[]

  // Balance Changes
  loan_income: notification_destination_types[]
  betting_streaks: notification_destination_types[]
  referral_bonuses: notification_destination_types[]
  unique_bettors_on_your_contract: notification_destination_types[]
  tips_on_your_comments: notification_destination_types[]
  tips_on_your_markets: notification_destination_types[]
  limit_order_fills: notification_destination_types[]

  // General
  tagged_user: notification_destination_types[]
  on_new_follow: notification_destination_types[]
  contract_from_followed_user: notification_destination_types[]
  trending_markets: notification_destination_types[]
  profit_loss_updates: notification_destination_types[]
  onboarding_flow: notification_destination_types[]
  thank_you_for_purchases: notification_destination_types[]

  opt_out_all: notification_destination_types[]
  // When adding a new notification preference, use add-new-notification-preference.ts to existing users
}

export const getDefaultNotificationPreferences = (
  userId: string,
  privateUser?: PrivateUser,
  noEmails?: boolean
) => {
  const constructPref = (browserIf: boolean, emailIf: boolean) => {
    const browser = browserIf ? 'browser' : undefined
    const email = noEmails ? undefined : emailIf ? 'email' : undefined
    return filterDefined([browser, email]) as notification_destination_types[]
  }
  const defaults: notification_preferences = {
    // Watched Markets
    all_comments_on_watched_markets: constructPref(true, false),
    all_answers_on_watched_markets: constructPref(true, false),

    // Comments
    tips_on_your_comments: constructPref(true, true),
    comments_by_followed_users_on_watched_markets: constructPref(true, true),
    all_replies_to_my_comments_on_watched_markets: constructPref(true, true),
    all_replies_to_my_answers_on_watched_markets: constructPref(true, true),
    all_comments_on_contracts_with_shares_in_on_watched_markets: constructPref(
      true,
      false
    ),

    // Answers
    answers_by_followed_users_on_watched_markets: constructPref(true, true),
    answers_by_market_creator_on_watched_markets: constructPref(true, true),
    all_answers_on_contracts_with_shares_in_on_watched_markets: constructPref(
      true,
      true
    ),

    // On users' markets
    your_contract_closed: constructPref(true, true), // High priority
    all_comments_on_my_markets: constructPref(true, true),
    all_answers_on_my_markets: constructPref(true, true),
    subsidized_your_market: constructPref(true, true),

    // Market updates
    resolutions_on_watched_markets: constructPref(true, false),
    market_updates_on_watched_markets: constructPref(true, false),
    market_updates_on_watched_markets_with_shares_in: constructPref(
      true,
      false
    ),
    resolutions_on_watched_markets_with_shares_in: constructPref(true, true),

    //Balance Changes
    loan_income: constructPref(true, false),
    betting_streaks: constructPref(true, false),
    referral_bonuses: constructPref(true, true),
    unique_bettors_on_your_contract: constructPref(true, true),
    tipped_comments_on_watched_markets: constructPref(true, true),
    tips_on_your_markets: constructPref(true, true),
    limit_order_fills: constructPref(true, false),

    // General
    tagged_user: constructPref(true, true),
    on_new_follow: constructPref(true, true),
    contract_from_followed_user: constructPref(true, true),
    trending_markets: constructPref(false, true),
    profit_loss_updates: constructPref(false, true),
    probability_updates_on_watched_markets: constructPref(true, false),
    thank_you_for_purchases: constructPref(false, false),
    onboarding_flow: constructPref(false, false),

    opt_out_all: [],
  }
  return defaults
}

// Adding a new key:value here is optional, you can just use a key of notification_subscription_types
// You might want to add a key:value here if there will be multiple notification reasons that map to the same
// subscription type, i.e. 'comment_on_contract_you_follow' and 'comment_on_contract_with_users_answer' both map to
// 'all_comments_on_watched_markets' subscription type
// TODO: perhaps better would be to map notification_subscription_types to arrays of notification_reason_types
const notificationReasonToSubscriptionType: Partial<
  Record<notification_reason_types, notification_preference>
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

export const getNotificationDestinationsForUser = (
  privateUser: PrivateUser,
  // TODO: accept reasons array from most to least important and work backwards
  reason: notification_reason_types | notification_preference
) => {
  const notificationSettings = privateUser.notificationPreferences
  const unsubscribeEndpoint = getFunctionUrl('unsubscribe')
  try {
    let destinations
    let subscriptionType: notification_preference | undefined
    if (Object.keys(notificationSettings).includes(reason)) {
      subscriptionType = reason as notification_preference
      destinations = notificationSettings[subscriptionType]
    } else {
      const key = reason as notification_reason_types
      subscriptionType = notificationReasonToSubscriptionType[key]
      destinations = subscriptionType
        ? notificationSettings[subscriptionType]
        : []
    }
    const optOutOfAllSettings = notificationSettings['opt_out_all']
    // Your market closure notifications are high priority, opt-out doesn't affect their delivery
    const optedOutOfEmail =
      optOutOfAllSettings.includes('email') &&
      subscriptionType !== 'your_contract_closed'
    const optedOutOfBrowser =
      optOutOfAllSettings.includes('browser') &&
      subscriptionType !== 'your_contract_closed'
    return {
      sendToEmail: destinations.includes('email') && !optedOutOfEmail,
      sendToBrowser: destinations.includes('browser') && !optedOutOfBrowser,
      unsubscribeUrl: `${unsubscribeEndpoint}?id=${privateUser.id}&type=${subscriptionType}`,
      urlToManageThisNotification: `${DOMAIN}/notifications?tab=settings&section=${subscriptionType}`,
    }
  } catch (e) {
    // Fail safely
    console.log(
      `couldn't get notification destinations for type ${reason} for user ${privateUser.id}`
    )
    return {
      sendToEmail: false,
      sendToBrowser: false,
      unsubscribeUrl: '',
      urlToManageThisNotification: '',
    }
  }
}
