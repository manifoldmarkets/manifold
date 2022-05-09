// A txn (pronounced "texan") respresents a payment between two ids on Manifold
// Shortened from "transaction" to distinguish from Firebase transactions (and save chars)
export type Txn = {
  id: string
  createdTime: number

  fromId: string
  fromType: SourceType

  toId: string
  toType: SourceType

  amount: number
  token: 'M$' // | 'USD' | MarketOutcome

  category: 'CHARITY' | 'MANALINK' // | 'BET' | 'TIP'
  // Human-readable description
  description?: string
}

export type SourceType = 'USER' | 'CONTRACT' | 'CHARITY' | 'BANK'
