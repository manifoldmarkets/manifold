import { useState, useEffect } from 'react'
import {
  listenForTransactions,
  Transaction,
} from '../lib/firebase/transactions'

export const useTransactions = () => {
  const [transactions, setTransactions] = useState<Transaction[] | undefined>()
  useEffect(() => listenForTransactions(setTransactions), [])
  return transactions
}
