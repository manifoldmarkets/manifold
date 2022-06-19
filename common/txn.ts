// A txn (pronounced "texan") respresents a payment between two ids on Manifold
// Shortened from "transaction" to distinguish from Firebase transactions (and save chars)
export type AnyTxnType = Donation | Tip

export type Txn<T extends AnyTxnType = AnyTxnType> = {
  id: string
  createdTime: number

  fromId: string
  toId: string

  amount: number
  token: 'M$' // | 'USD' | MarketOutcome

  // Any extra data
  data?: { [key: string]: any }

  // Human-readable description
  description?: string
} & T

export type Donation = {
  fromType: 'USER'
  toType: 'CHARITY'
  category: 'CHARITY'
}

export type Tip = {
  fromType: 'USER'
  toType: 'USER'
  category: 'TIP'
  data: {
    contractId: string
    commentId: string
  }
}

export type DonationTxn = Txn & Donation
export type TipTxn = Txn & Tip
