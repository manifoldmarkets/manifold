// ============================================================================
// ANGOLA SIMPLIFIED TYPES
// ============================================================================
// Simplified type definitions for YES/NO binary markets only
// Removes: Multiple choice, numeric, poll, stonk, and other complex types
// Currency: AOA (Angolan Kwanza) instead of Mana
// ============================================================================

import { JSONContent } from '@tiptap/core'

// ============================================================================
// USER TYPES
// ============================================================================

export type AngolaUser = {
  id: string
  createdTime: number

  // Profile
  name: string
  username: string
  avatarUrl?: string
  bio?: string

  // Contact
  email?: string
  phoneNumber?: string
  phoneVerified: boolean

  // Balance (in AOA - Angolan Kwanza)
  balance: number
  totalDeposits: number
  totalWithdrawals: number

  // Stats
  totalBetsCount: number
  marketsCreatedCount: number
  profitLoss: number

  // Status
  isBanned: boolean
  isAdmin: boolean

  // Referral
  referredByUserId?: string
  referralCode?: string

  // Timestamps
  lastBetTime?: number
  lastLoginTime?: number
}

export type AngolaPrivateUser = {
  id: string
  apiKey?: string

  // Notifications
  emailNotifications: boolean
  smsNotifications: boolean

  // Blocked users
  blockedUserIds: string[]
}

// ============================================================================
// MARKET TYPES (YES/NO BINARY ONLY)
// ============================================================================

export type MarketVisibility = 'public' | 'unlisted'
export type MarketResolution = 'YES' | 'NO' | 'MKT' | 'CANCEL'
export type BetOutcome = 'YES' | 'NO'

export type AngolaMarket = {
  id: string
  slug: string

  // Creator info
  creatorId: string
  creatorUsername: string
  creatorName: string
  creatorAvatarUrl?: string

  // Content
  question: string
  description: JSONContent | string
  descriptionText?: string
  coverImageUrl?: string

  // Settings
  visibility: MarketVisibility
  initialProbability: number

  // AMM Pool State (CPMM for YES/NO)
  pool: {
    YES: number
    NO: number
  }
  p: number // Probability constant

  // Current state
  prob: number // Current probability (0-1)
  probChanges: {
    day: number
    week: number
    month: number
  }

  // Liquidity
  totalLiquidity: number
  subsidyPool: number

  // Volume & Stats (in AOA)
  volume: number
  volume24Hours: number
  uniqueBettorsCount: number

  // Fees collected (in AOA)
  collectedFees: {
    creatorFee: number
    platformFee: number
    liquidityFee: number
  }

  // Resolution
  isResolved: boolean
  resolution?: MarketResolution
  resolutionProbability?: number // For MKT resolution
  resolutionTime?: number
  resolverId?: string
  resolutionNotes?: string

  // Scoring
  popularityScore: number
  importanceScore: number
  viewCount: number

  // Timestamps
  createdTime: number
  lastUpdatedTime: number
  closeTime?: number
  lastBetTime?: number
  lastCommentTime?: number

  // Soft delete
  deleted?: boolean
}

// Simplified market for lists
export type AngolaMarketLite = Pick<
  AngolaMarket,
  | 'id'
  | 'slug'
  | 'question'
  | 'creatorUsername'
  | 'creatorAvatarUrl'
  | 'prob'
  | 'probChanges'
  | 'volume'
  | 'uniqueBettorsCount'
  | 'isResolved'
  | 'resolution'
  | 'closeTime'
  | 'createdTime'
>

// ============================================================================
// BET TYPES
// ============================================================================

export type Fees = {
  creatorFee: number
  platformFee: number
  liquidityFee: number
}

export type AngolaBet = {
  id: string

  // References
  userId: string
  marketId: string

  // Bet details
  outcome: BetOutcome
  amount: number // In AOA (negative for SELL)
  shares: number // Shares acquired (negative for SELL)

  // Probability state
  probBefore: number
  probAfter: number

  // Fees (in AOA)
  fees: Fees

  // Limit order (optional)
  isLimitOrder?: boolean
  limitProb?: number
  orderAmount?: number
  isFilled?: boolean
  isCancelled?: boolean
  expiresAt?: number

  // Flags
  isRedemption: boolean
  isApi?: boolean

  // Timestamps
  createdTime: number
  updatedTime?: number
}

// Limit order fill
export type BetFill = {
  matchedBetId: string | null
  amount: number
  shares: number
  timestamp: number
  fees?: Fees
  isSale?: boolean
}

// ============================================================================
// COMMENT TYPES
// ============================================================================

export type AngolaComment = {
  id: string

  // References
  marketId: string
  userId: string

  // Content
  content: JSONContent
  contentText?: string

  // Thread
  replyToCommentId?: string

  // Bet context (optional)
  betId?: string
  betAmount?: number
  betOutcome?: BetOutcome

  // Engagement
  likesCount: number

  // Visibility
  isHidden: boolean
  hiddenByUserId?: string
  hiddenReason?: string

  // Timestamps
  createdTime: number
  editedTime?: number
}

// ============================================================================
// TRANSACTION TYPES
// ============================================================================

export type TransactionType =
  | 'DEPOSIT'
  | 'WITHDRAWAL'
  | 'BET'
  | 'BET_SALE'
  | 'PAYOUT'
  | 'MARKET_CREATION'
  | 'REFERRAL_BONUS'
  | 'SIGNUP_BONUS'

export type AngolaTransaction = {
  id: string
  userId: string
  type: TransactionType
  amount: number // In AOA, positive for credit, negative for debit
  balanceBefore: number
  balanceAfter: number

  // Related entities
  marketId?: string
  betId?: string
  relatedUserId?: string

  description?: string
  externalReference?: string

  createdTime: number
}

// ============================================================================
// NOTIFICATION TYPES
// ============================================================================

export type NotificationType =
  | 'bet_fill'
  | 'market_resolved'
  | 'comment_reply'
  | 'market_comment'
  | 'referral_bonus'

export type AngolaNotification = {
  id: string
  userId: string
  type: NotificationType
  title: string
  body?: string

  // Related
  marketId?: string
  commentId?: string
  sourceUserId?: string

  // Status
  isRead: boolean
  readAt?: number

  createdTime: number
}

// ============================================================================
// USER POSITION (Aggregated view)
// ============================================================================

export type UserPosition = {
  userId: string
  marketId: string
  yesShares: number
  noShares: number
  totalInvested: number
  betsCount: number
  lastBetAt?: number
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

// Create Market
export type CreateMarketRequest = {
  question: string
  description?: string | JSONContent
  initialProbability: number // 0.01 - 0.99
  closeTime?: number // Unix timestamp
  visibility?: MarketVisibility
  initialLiquidity?: number // In AOA
}

export type CreateMarketResponse = {
  market: AngolaMarket
}

// Place Bet
export type PlaceBetRequest = {
  marketId: string
  outcome: BetOutcome
  amount: number // In AOA
  limitProb?: number // For limit orders
}

export type PlaceBetResponse = {
  bet: AngolaBet
  newBalance: number
}

// Resolve Market
export type ResolveMarketRequest = {
  marketId: string
  resolution: MarketResolution
  resolutionProbability?: number // Required for MKT resolution
  notes?: string
}

export type ResolveMarketResponse = {
  market: AngolaMarket
  payoutsCount: number
  totalPayout: number
}

// Sell Shares
export type SellSharesRequest = {
  marketId: string
  outcome: BetOutcome
  shares?: number // If not specified, sell all
}

export type SellSharesResponse = {
  bet: AngolaBet
  newBalance: number
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

export type PaginatedResponse<T> = {
  data: T[]
  hasMore: boolean
  nextCursor?: string
}

export type ApiError = {
  code: string
  message: string
  details?: Record<string, unknown>
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const NO_FEES: Fees = {
  creatorFee: 0,
  platformFee: 0,
  liquidityFee: 0,
}

export const MAX_QUESTION_LENGTH = 200
export const MIN_QUESTION_LENGTH = 10
export const MAX_DESCRIPTION_LENGTH = 16000

export const MAX_PROB = 0.99
export const MIN_PROB = 0.01

export const RESOLUTIONS: MarketResolution[] = ['YES', 'NO', 'MKT', 'CANCEL']
