// A txn (pronounced "texan") respresents a payment between two ids on Manifold
// Shortened from "transaction" to distinguish from Firebase transactions (and save chars)
export type Txn = {
  id: string
  createdTime: number

  fromId: string
  fromName: string
  fromUsername: string
  fromAvatarUrl?: string

  toId: string
  toName: string
  toUsername: string
  toAvatarUrl?: string

  amount: number

  category: TxnCategory
  // Human-readable description
  description?: string
  // Structured metadata for different kinds of txns
  data?: TxnData
}

export type TxnCategory = 'TO_CHARITY' // | 'TIP' | 'BET' | ...
export type TxnData = CharityData // | TipData | BetData | ...

export type CharityData = {
  // TODO: Could fill this in
}
