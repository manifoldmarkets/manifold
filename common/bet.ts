import { Fees } from './fees'

export type Bet = {
  id: string
  userId: string
  contractId: string
  createdTime: number

  amount: number // bet size; negative if SELL bet
  loanAmount?: number
  outcome: string
  shares: number // dynamic parimutuel pool weight or fixed ; negative if SELL bet

  probBefore: number
  probAfter: number

  sale?: {
    amount: number // amount user makes from sale
    betId: string // id of bet being sold
    // TODO: add sale time?
  }

  fees: Fees

  isSold?: boolean // true if this BUY bet has been sold
  isAnte?: boolean
  isLiquidityProvision?: boolean
  isRedemption?: boolean
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

export const MAX_LOAN_PER_CONTRACT = 20
