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
  | ManaPurchase
  | SignupBonus
  | CertMint
  | CertTransfer
  | CertPayMana
  | CertDividend
  | CertBurn
  | ContractResolutionPayout
  | QfPayment
  | QfAddPool
  | QfDividend
type SourceType = 'USER' | 'CONTRACT' | 'CHARITY' | 'BANK'

export type Txn<T extends AnyTxnType = AnyTxnType> = {
  id: string
  createdTime: number

  fromId: string
  fromType: SourceType

  toId: string
  toType: SourceType

  amount: number
  token: 'M$' | 'SHARE' // | 'USD' | MarketOutcome

  category:
    | 'CHARITY'
    | 'MANALINK'
    | 'TIP'
    | 'REFERRAL'
    | 'UNIQUE_BETTOR_BONUS'
    | 'BETTING_STREAK_BONUS'
    | 'CANCEL_UNIQUE_BETTOR_BONUS'
    | 'MANA_PURCHASE'
    | 'SIGNUP_BONUS'
    | 'CERT_MINT' // Create a new cert
    | 'CERT_TRANSFER' // Transfer cert ownership
    | 'CERT_PAY_MANA' // Transfer mana for a cert
    | 'CERT_DIVIDEND' // Cert holder pays out dividends
    | 'CERT_BURN' // Destroy a cert
    | 'CONTRACT_RESOLUTION_PAYOUT' // Contract resolution pays out to a user
    | 'QF_PAYMENT' // Pay one of the entries in a QF pool
    | 'QF_ADD_POOL' // Fund a QF pool
    | 'QF_DIVIDEND' // Pay out QF dividends

  // Any extra data
  data?: { [key: string]: any }

  // Human-readable description
  description?: string
} & T

type CertId = {
  // TODO: should certIds be in data?
  certId: string
}

type CertMint = {
  category: 'CERT_MINT'
  fromType: 'BANK'
  toType: 'USER'
  token: 'SHARE'
}

// TODO: want some kind of ID that ties these together?
type CertTransfer = {
  category: 'CERT_TRANSFER'
  fromType: 'USER' | 'CONTRACT'
  toType: 'USER' | 'CONTRACT'
  token: 'SHARE'
}

type CertPayMana = {
  category: 'CERT_PAY_MANA'
  fromType: 'USER' | 'CONTRACT'
  toType: 'USER' | 'CONTRACT'
  token: 'M$'
}

type CertDividend = {
  category: 'CERT_DIVIDEND'
  fromType: 'USER'
  toType: 'USER'
  token: 'M$'
}

type CertBurn = {
  category: 'CERT_BURN'
  fromType: 'USER'
  toType: 'BANK'
  token: 'SHARE'
}

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

type ContractResolutionPayout = {
  fromType: 'CONTRACT'
  toType: 'USER'
  category: 'CONTRACT_RESOLUTION_PAYOUT'
  token: 'M$'
  data: {
    reverted?: boolean
    deposit?: number
  }
}

type QfId = {
  qfId: string
}

type QfPayment = {
  category: 'QF_PAYMENT'
  fromType: 'USER'
  toType: 'USER'
  data: {
    answerId: string
  }
}

type QfAddPool = {
  category: 'QF_ADD_POOL'
  fromType: 'USER'
  toType: 'CONTRACT'
}

type QfDividend = {
  category: 'QF_DIVIDEND'
  fromType: 'CONTRACT'
  toType: 'USER'
}

export type DonationTxn = Txn & Donation
export type TipTxn = Txn & Tip
export type ManalinkTxn = Txn & Manalink
export type ReferralTxn = Txn & Referral
export type BettingStreakBonusTxn = Txn & BettingStreakBonus
export type UniqueBettorBonusTxn = Txn & UniqueBettorBonus
export type CancelUniqueBettorBonusTxn = Txn & CancelUniqueBettorBonus
export type ManaPurchaseTxn = Txn & ManaPurchase
export type SignupBonusTxn = Txn & SignupBonus
export type CertTxn = Txn & CertId
export type CertMintTxn = CertTxn & CertMint
export type CertTransferTxn = CertTxn & CertTransfer
export type CertPayManaTxn = CertTxn & CertPayMana
export type CertDividendTxn = CertTxn & CertDividend
export type CertBurnTxn = CertTxn & CertBurn
export type ContractResolutionPayoutTxn = Txn & ContractResolutionPayout
export type QfTxn = Txn & QfId
export type QfPaymentTxn = QfTxn & QfPayment
export type QfAddPoolTxn = QfTxn & QfAddPool
export type QfDividendTxn = QfTxn & QfDividend
