// A txn (pronounced "texan") respresents a payment between two ids on Manifold
// Shortened from "transaction" to distinguish from Firebase transactions (and save chars)
type AnyTxnType = Donation | Tip | Manalink | Referral | Bonus
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
    | 'DAILY_BONUS' // | 'BET'
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
    contractId: string
    commentId: string
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

type Bonus = {
  fromType: 'BANK'
  toType: 'USER'
  category: 'DAILY_BONUS' | 'UNIQUE_BETTOR_BONUS'
}

export type DonationTxn = Txn & Donation
export type TipTxn = Txn & Tip
export type ManalinkTxn = Txn & Manalink
export type ReferralTxn = Txn & Referral
