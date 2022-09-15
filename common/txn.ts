// A txn (pronounced "texan") respresents a payment between two ids on Manifold
// Shortened from "transaction" to distinguish from Firebase transactions (and save chars)
type AnyTxnType =
  | Donation
  | Tip
  | Manalink
  | Referral
  | UniqueBettorBonus
  | BettingStreakBonus
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
  // This data was mistakenly stored as a stringified JSON object in description previously
  data: {
    contractId: string
    uniqueNewBettorId?: string
    // Previously stored all unique bettor ids in description
    uniqueBettorIds?: string[]
  }
}

type BettingStreakBonus = {
  fromType: 'BANK'
  toType: 'USER'
  category: 'BETTING_STREAK_BONUS'
  // This data was mistakenly stored as a stringified JSON object in description previously
  data: {
    currentBettingStreak?: number
  }
}

export type DonationTxn = Txn & Donation
export type TipTxn = Txn & Tip
export type ManalinkTxn = Txn & Manalink
export type ReferralTxn = Txn & Referral
export type BettingStreakBonusTxn = Txn & BettingStreakBonus
export type UniqueBettorBonusTxn = Txn & UniqueBettorBonus
