// A txn (pronounced "texan") respresents a payment between two ids on Manifold
// Shortened from "transaction" to distinguish from Firebase transactions (and save chars)
export type Txn = {
  id: string
  createdTime: number

  fromId: string
  fromType: source_type

  toId: string
  toType: source_type

  amount: number
  token: 'M$' // | 'USD' | MarketOutcome

  category: 'CHARITY' // | 'BET' | 'TIP'
  // Human-readable description
  description?: string
}

export type source_type = 'user' | 'contract' | 'charity' | 'bank'
