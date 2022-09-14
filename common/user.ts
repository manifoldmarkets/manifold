import { filterDefined } from './util/array'

export type User = {
  id: string
  createdTime: number

  name: string
  username: string
  avatarUrl?: string

  // For their user page
  bio?: string
  bannerUrl?: string
  website?: string
  twitterHandle?: string
  discordHandle?: string

  balance: number
  totalDeposits: number

  profitCached: {
    daily: number
    weekly: number
    monthly: number
    allTime: number
  }

  creatorVolumeCached: {
    daily: number
    weekly: number
    monthly: number
    allTime: number
  }

  nextLoanCached: number
  followerCountCached: number

  followedCategories?: string[]
  homeSections?: string[]

  referredByUserId?: string
  referredByContractId?: string
  referredByGroupId?: string
  lastPingTime?: number
  shouldShowWelcome?: boolean
  lastBetTime?: number
  currentBettingStreak?: number
  hasSeenContractFollowModal?: boolean
  freeMarketsCreated?: number
  isBannedFromPosting?: boolean
}

export type PrivateUser = {
  id: string // same as User.id
  username: string // denormalized from User

  email?: string
  unsubscribedFromResolutionEmails?: boolean
  unsubscribedFromCommentEmails?: boolean
  unsubscribedFromAnswerEmails?: boolean
  unsubscribedFromGenericEmails?: boolean
  unsubscribedFromWeeklyTrendingEmails?: boolean
  weeklyTrendingEmailSent?: boolean
  manaBonusEmailSent?: boolean
  initialDeviceToken?: string
  initialIpAddress?: string
  apiKey?: string
  notificationPreferences: notification_subscription_types
  twitchInfo?: {
    twitchName: string
    controlToken: string
    botEnabled?: boolean
  }
}

export type notification_destination_types = 'email' | 'browser'
export type notification_subscription_types = {
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
}
export type notification_subscribe_types = 'all' | 'less' | 'none'

export type PortfolioMetrics = {
  investmentValue: number
  balance: number
  totalDeposits: number
  timestamp: number
  userId: string
}

export const MANIFOLD_USERNAME = 'ManifoldMarkets'
export const MANIFOLD_AVATAR_URL = 'https://manifold.markets/logo-bg-white.png'

export const getDefaultNotificationSettings = (
  userId: string,
  privateUser?: PrivateUser,
  noEmails?: boolean
) => {
  const {
    unsubscribedFromCommentEmails,
    unsubscribedFromAnswerEmails,
    unsubscribedFromResolutionEmails,
    unsubscribedFromWeeklyTrendingEmails,
    unsubscribedFromGenericEmails,
  } = privateUser || {}

  const constructPref = (browserIf: boolean, emailIf: boolean) => {
    const browser = browserIf ? 'browser' : undefined
    const email = noEmails ? undefined : emailIf ? 'email' : undefined
    return filterDefined([browser, email]) as notification_destination_types[]
  }
  return {
    // Watched Markets
    all_comments_on_watched_markets: constructPref(
      true,
      !unsubscribedFromCommentEmails
    ),
    all_answers_on_watched_markets: constructPref(
      true,
      !unsubscribedFromAnswerEmails
    ),

    // Comments
    tips_on_your_comments: constructPref(true, !unsubscribedFromCommentEmails),
    comments_by_followed_users_on_watched_markets: constructPref(true, false),
    all_replies_to_my_comments_on_watched_markets: constructPref(
      true,
      !unsubscribedFromCommentEmails
    ),
    all_replies_to_my_answers_on_watched_markets: constructPref(
      true,
      !unsubscribedFromCommentEmails
    ),
    all_comments_on_contracts_with_shares_in_on_watched_markets: constructPref(
      true,
      !unsubscribedFromCommentEmails
    ),

    // Answers
    answers_by_followed_users_on_watched_markets: constructPref(
      true,
      !unsubscribedFromAnswerEmails
    ),
    answers_by_market_creator_on_watched_markets: constructPref(
      true,
      !unsubscribedFromAnswerEmails
    ),
    all_answers_on_contracts_with_shares_in_on_watched_markets: constructPref(
      true,
      !unsubscribedFromAnswerEmails
    ),

    // On users' markets
    your_contract_closed: constructPref(
      true,
      !unsubscribedFromResolutionEmails
    ), // High priority
    all_comments_on_my_markets: constructPref(
      true,
      !unsubscribedFromCommentEmails
    ),
    all_answers_on_my_markets: constructPref(
      true,
      !unsubscribedFromAnswerEmails
    ),
    subsidized_your_market: constructPref(true, true),

    // Market updates
    resolutions_on_watched_markets: constructPref(
      true,
      !unsubscribedFromResolutionEmails
    ),
    market_updates_on_watched_markets: constructPref(true, false),
    market_updates_on_watched_markets_with_shares_in: constructPref(
      true,
      false
    ),
    resolutions_on_watched_markets_with_shares_in: constructPref(
      true,
      !unsubscribedFromResolutionEmails
    ),

    //Balance Changes
    loan_income: constructPref(true, false),
    betting_streaks: constructPref(true, false),
    referral_bonuses: constructPref(true, true),
    unique_bettors_on_your_contract: constructPref(true, false),
    tipped_comments_on_watched_markets: constructPref(
      true,
      !unsubscribedFromCommentEmails
    ),
    tips_on_your_markets: constructPref(true, true),
    limit_order_fills: constructPref(true, false),

    // General
    tagged_user: constructPref(true, true),
    on_new_follow: constructPref(true, true),
    contract_from_followed_user: constructPref(true, true),
    trending_markets: constructPref(
      false,
      !unsubscribedFromWeeklyTrendingEmails
    ),
    profit_loss_updates: constructPref(false, true),
    probability_updates_on_watched_markets: constructPref(true, false),
    thank_you_for_purchases: constructPref(
      false,
      !unsubscribedFromGenericEmails
    ),
    onboarding_flow: constructPref(false, !unsubscribedFromGenericEmails),
  } as notification_subscription_types
}
