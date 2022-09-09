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
  homeSections?: { visible: string[]; hidden: string[] }

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
  notificationPreferences?: notification_subscribe_types
  notificationSubscriptionTypes: notification_subscription_types
}

export type notification_destination_types = 'email' | 'browser'

export type notification_subscription_types = {
  // Watched Markets
  all_comments_on_watched_markets: notification_destination_types[] // Email currently - seems bad
  all_answers_on_watched_markets: notification_destination_types[] // Email currently - seems bad

  // Comments
  tipped_comments_on_watched_markets: notification_destination_types[] // Email
  comments_by_followed_users_on_watched_markets: notification_destination_types[]
  all_replies_to_my_comments_on_watched_markets: notification_destination_types[] // Email
  all_replies_to_my_answers_on_watched_markets: notification_destination_types[] // Email
  all_comments_on_contracts_with_shares_in_on_watched_markets: notification_destination_types[]

  // Answers
  answers_by_followed_users_on_watched_markets: notification_destination_types[]
  answers_by_market_creator_on_watched_markets: notification_destination_types[]
  all_answers_on_contracts_with_shares_in_on_watched_markets: notification_destination_types[]

  // On users' markets
  your_contract_closed: notification_destination_types[] // Email, Recommended
  all_comments_on_my_markets: notification_destination_types[] // Email
  all_answers_on_my_markets: notification_destination_types[] // Email
  subsidized_your_market: notification_destination_types[] // Email

  // Market updates
  resolutions_on_watched_markets: notification_destination_types[] // Email
  resolutions_on_watched_markets_with_shares_in: notification_destination_types[] // Email
  market_updates_on_watched_markets: notification_destination_types[]
  market_updates_on_watched_markets_with_shares_in: notification_destination_types[]
  probability_updates_on_watched_markets: notification_destination_types[] // Email - would want persistent changes only though

  // Balance Changes
  loan_income: notification_destination_types[]
  betting_streaks: notification_destination_types[]
  referral_bonuses: notification_destination_types[]
  unique_bettors_on_your_contract: notification_destination_types[]
  tips_on_your_comments: notification_destination_types[]
  tips_on_your_markets: notification_destination_types[]
  limit_order_fills: notification_destination_types[]

  // General
  tagged_user: notification_destination_types[] // Email
  on_new_follow: notification_destination_types[] // Email
  contract_from_followed_user: notification_destination_types[] // Email
  trending_markets: notification_destination_types[] // Email
  profit_loss_updates: notification_destination_types[] // Email
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
  const prevPref = privateUser?.notificationPreferences ?? 'all'
  const wantsLess = prevPref === 'less'
  const wantsAll = prevPref === 'all'
  const {
    unsubscribedFromCommentEmails,
    unsubscribedFromAnswerEmails,
    unsubscribedFromResolutionEmails,
    unsubscribedFromWeeklyTrendingEmails,
  } = privateUser || {}

  const constructPref = (browserIf: boolean, emailIf: boolean) => {
    const browser = browserIf ? 'browser' : undefined
    const email = noEmails ? undefined : emailIf ? 'email' : undefined
    return filterDefined([browser, email]) as notification_destination_types[]
  }
  return {
    // Watched Markets
    all_comments_on_watched_markets: constructPref(
      wantsAll,
      !unsubscribedFromCommentEmails
    ),
    all_answers_on_watched_markets: constructPref(
      wantsAll,
      !unsubscribedFromAnswerEmails
    ),

    // Comments
    tips_on_your_comments: constructPref(
      wantsAll || wantsLess,
      !unsubscribedFromCommentEmails
    ),
    comments_by_followed_users_on_watched_markets: constructPref(
      wantsAll,
      false
    ),
    all_replies_to_my_comments_on_watched_markets: constructPref(
      wantsAll || wantsLess,
      !unsubscribedFromCommentEmails
    ),
    all_replies_to_my_answers_on_watched_markets: constructPref(
      wantsAll || wantsLess,
      !unsubscribedFromCommentEmails
    ),
    all_comments_on_contracts_with_shares_in_on_watched_markets: constructPref(
      wantsAll,
      !unsubscribedFromCommentEmails
    ),

    // Answers
    answers_by_followed_users_on_watched_markets: constructPref(
      wantsAll || wantsLess,
      !unsubscribedFromAnswerEmails
    ),
    answers_by_market_creator_on_watched_markets: constructPref(
      wantsAll || wantsLess,
      !unsubscribedFromAnswerEmails
    ),
    all_answers_on_contracts_with_shares_in_on_watched_markets: constructPref(
      wantsAll,
      !unsubscribedFromAnswerEmails
    ),

    // On users' markets
    your_contract_closed: constructPref(
      wantsAll || wantsLess,
      !unsubscribedFromResolutionEmails
    ), // High priority
    all_comments_on_my_markets: constructPref(
      wantsAll || wantsLess,
      !unsubscribedFromCommentEmails
    ),
    all_answers_on_my_markets: constructPref(
      wantsAll || wantsLess,
      !unsubscribedFromAnswerEmails
    ),
    subsidized_your_market: constructPref(wantsAll || wantsLess, true),

    // Market updates
    resolutions_on_watched_markets: constructPref(
      wantsAll || wantsLess,
      !unsubscribedFromResolutionEmails
    ),
    market_updates_on_watched_markets: constructPref(
      wantsAll || wantsLess,
      false
    ),
    market_updates_on_watched_markets_with_shares_in: constructPref(
      wantsAll || wantsLess,
      false
    ),
    resolutions_on_watched_markets_with_shares_in: constructPref(
      wantsAll || wantsLess,
      !unsubscribedFromResolutionEmails
    ),

    //Balance Changes
    loan_income: constructPref(wantsAll || wantsLess, false),
    betting_streaks: constructPref(wantsAll || wantsLess, false),
    referral_bonuses: constructPref(wantsAll || wantsLess, true),
    unique_bettors_on_your_contract: constructPref(
      wantsAll || wantsLess,
      false
    ),
    tipped_comments_on_watched_markets: constructPref(
      wantsAll || wantsLess,
      !unsubscribedFromCommentEmails
    ),
    tips_on_your_markets: constructPref(wantsAll || wantsLess, true),
    limit_order_fills: constructPref(wantsAll || wantsLess, false),

    // General
    tagged_user: constructPref(wantsAll || wantsLess, true),
    on_new_follow: constructPref(wantsAll || wantsLess, true),
    contract_from_followed_user: constructPref(wantsAll || wantsLess, true),
    trending_markets: constructPref(
      false,
      !unsubscribedFromWeeklyTrendingEmails
    ),
    profit_loss_updates: constructPref(false, true),
    probability_updates_on_watched_markets: constructPref(
      wantsAll || wantsLess,
      false
    ),
  } as notification_subscription_types
}
