import { visibility } from './contract'
import { Fees } from './fees'

/************************************************

supabase status: columns exist for
  userId: text
  createdTime: timestamp (from millis)
  amount: number
  shares: number
  outcome: text
  probBefore: number
  probAfter: number
  isAnte: boolean
  isRedemption: boolean
  isChallenge: boolean
  visibility: text

any changes to the type of these columns in firestore will require modifying
the supabase trigger, or replication of contracts may fail!

*************************************************/

export type Bet = {
  id: string
  userId: string

  // denormalized for bet lists
  userAvatarUrl?: string
  userUsername: string
  userName: string

  contractId: string
  createdTime: number

  amount: number // bet size; negative if SELL bet
  loanAmount?: number
  outcome: string
  shares: number // dynamic parimutuel pool weight or fixed ; negative if SELL bet

  // Gain shares in multiple outcomes.
  sharesByOutcome?: { [outcome: string]: number }

  probBefore: number
  probAfter: number

  fees: Fees

  isApi?: boolean // true if bet was placed via API

  isAnte: boolean
  isRedemption: boolean
  isChallenge: boolean
  visibility: visibility
  challengeSlug?: string

  // Props for bets in DPM contract below.
  // A bet is either a BUY or a SELL that sells all of a previous buy.
  isSold?: boolean // true if this BUY bet has been sold
  // This field marks a SELL bet.
  sale?: {
    amount: number // amount user makes from sale
    betId: string // id of BUY bet being sold
  }
} & Partial<LimitProps>

export type NumericBet = Bet & {
  value: number
  allOutcomeShares: { [outcome: string]: number }
  allBetAmounts: { [outcome: string]: number }
}

// Binary market limit order.
export type LimitBet = Bet & LimitProps

type LimitProps = {
  orderAmount: number // Amount of limit order.
  limitProb: number // [0, 1]. Bet to this probability.
  isFilled: boolean // Whether all of the bet amount has been filled.
  isCancelled: boolean // Whether to prevent any further fills.
  // A record of each transaction that partially (or fully) fills the orderAmount.
  // I.e. A limit order could be filled by partially matching with several bets.
  // Non-limit orders can also be filled by matching with multiple limit orders.
  fills: fill[]
  expiresAt?: number // ms since epoch.
}

export type fill = {
  // The id the bet matched against, or null if the bet was matched by the pool.
  matchedBetId: string | null
  amount: number
  shares: number
  timestamp: number
  // If the fill is a sale, it means the matching bet has shares of the same outcome.
  // I.e. -fill.shares === matchedBet.shares
  isSale?: boolean
}

export type Loading<T> = T | 'loading'

export type BetFilter = {
  contractId?: string
  userId?: Loading<string>
  filterChallenges?: boolean
  filterRedemptions?: boolean
  filterAntes?: boolean
  isOpenLimitOrder?: boolean
  afterTime?: number
  beforeTime?: number
  order?: 'desc' | 'asc'
  limit?: number
}
