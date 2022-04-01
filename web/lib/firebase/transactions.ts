import { collection, doc, query, setDoc } from 'firebase/firestore'
import { db } from './init'
import { getValues, listenForValues } from './utils'

export type Transaction = {
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

  category: 'BUY_LEADERBOARD_SLOT' | 'LEADERBOARD_TAX'
  // Human-readable description
  description?: string
  // Structured metadata for different kinds of transactions
  data?: SlotData | TaxData
}

type SlotData = {
  slot: number
  message: string
}

type TaxData = {
  slot: number
}

export async function listAllTransactions() {
  const col = collection(db, 'transactions')
  const transactions = await getValues<Transaction>(col)
  transactions.sort((t1, t2) => t1.createdTime - t2.createdTime)
  return transactions
}

export function listenForTransactions(setTxns: (txns: Transaction[]) => void) {
  const col = collection(db, 'transactions')
  const queryAll = query(col)
  return listenForValues<Transaction>(queryAll, setTxns)
}

export async function writeTransaction(transaction: Transaction) {
  const col = collection(db, 'transactions')
  const newRef = doc(col)
  transaction.id = newRef.id

  await setDoc(newRef, transaction)
}
