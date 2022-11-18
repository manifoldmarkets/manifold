// A txn (pronounced "texan") respresents a payment between two ids on Manifold
// Shortened from "transaction" to distinguish from Firebase transactions (and save chars)
type AnyTxnType =
  | Donation
  | Tip
  | Manalink
  | Referral
  | UniqueBettorBonus
  | BettingStreakBonus
  | CancelUniqueBettorBonus
  | CommentBountyRefund
  | ManaPurchase
  | SignupBonus
type SourceType = 'USER' | 'CONTRACT' | 'CHARITY' | 'BANK'

export type Txn<T extends AnyTxnType = AnyTxnType> = {
  id: string
  createdTime: number

  fromId: string
  fromType: SourceType

  toId: string
  toType: SourceType

  amount: number
  token: 'M$' // | 'USD' | MarketOutcome

  category:
    | 'CHARITY'
    | 'MANALINK'
    | 'TIP'
    | 'REFERRAL'
    | 'UNIQUE_BETTOR_BONUS'
    | 'BETTING_STREAK_BONUS'
    | 'CANCEL_UNIQUE_BETTOR_BONUS'
    | 'COMMENT_BOUNTY'
    | 'REFUND_COMMENT_BOUNTY'
    | 'MANA_PURCHASE'
    | 'SIGNUP_BONUS'

  // Any extra data
  data?: { [key: string]: any }

  // Human-readable description
  description?: string
} & T

type Donation = {
  fromType: 'USER'
  toType: 'CHARITY'
  category: 'CHARITY'
}

type Tip = {
  fromType: 'USER'
  toType: 'USER'
  category: 'TIP'
  data: {
    commentId: string
    contractId?: string
    groupId?: string
  }
}

type Manalink = {
  fromType: 'USER'
  toType: 'USER'
  category: 'MANALINK'
}

type Referral = {
  fromType: 'BANK'
  toType: 'USER'
  category: 'REFERRAL'
}

type UniqueBettorBonus = {
  fromType: 'BANK'
  toType: 'USER'
  category: 'UNIQUE_BETTOR_BONUS'
  data: {
    contractId: string
    uniqueNewBettorId?: string
    // Old unique bettor bonus txns stored all unique bettor ids
    uniqueBettorIds?: string[]
  }
}

type BettingStreakBonus = {
  fromType: 'BANK'
  toType: 'USER'
  category: 'BETTING_STREAK_BONUS'
  data: {
    currentBettingStreak?: number
  }
}

type CancelUniqueBettorBonus = {
  fromType: 'USER'
  toType: 'BANK'
  category: 'CANCEL_UNIQUE_BETTOR_BONUS'
  data: {
    contractId: string
  }
}

type CommentBountyDeposit = {
  fromType: 'USER'
  toType: 'BANK'
  category: 'COMMENT_BOUNTY'
  data: {
    contractId: string
  }
}

type CommentBountyWithdrawal = {
  fromType: 'BANK'
  toType: 'USER'
  category: 'COMMENT_BOUNTY'
  data: {
    contractId: string
    commentId: string
  }
}

// Not currently used
type CommentBountyRefund = {
  fromType: 'BANK'
  toType: 'USER'
  category: 'REFUND_COMMENT_BOUNTY'
  data: {
    contractId: string
  }
}

type ManaPurchase = {
  fromType: 'BANK'
  toType: 'USER'
  category: 'MANA_PURCHASE'
  data: {
    iapTransactionId: string
    type: 'apple'
  }
}

type SignupBonus = {
  fromType: 'BANK'
  toType: 'USER'
  category: 'SIGNUP_BONUS'
}

export type DonationTxn = Txn & Donation
export type TipTxn = Txn & Tip
export type ManalinkTxn = Txn & Manalink
export type ReferralTxn = Txn & Referral
export type BettingStreakBonusTxn = Txn & BettingStreakBonus
export type UniqueBettorBonusTxn = Txn & UniqueBettorBonus
export type CancelUniqueBettorBonusTxn = Txn & CancelUniqueBettorBonus
export type CommentBountyDepositTxn = Txn & CommentBountyDeposit
export type CommentBountyWithdrawalTxn = Txn & CommentBountyWithdrawal
export type ManaPurchaseTxn = Txn & ManaPurchase
export type SignupBonusTxn = Txn & SignupBonus
