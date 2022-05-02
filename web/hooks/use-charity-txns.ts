import { useEffect, useState } from 'react'
import { Txn } from '../../common/txn'
import {
  listenForAllCharityTxns,
  listenForCharityTxns,
} from '../lib/firebase/txns'

export const useCharityTxns = (charityId: string) => {
  const [txns, setTxns] = useState<Txn[]>([])

  useEffect(() => {
    return listenForCharityTxns(charityId, setTxns)
  }, [charityId])

  return txns
}

export const useAllCharityTxns = () => {
  const [txns, setTxns] = useState<Txn[]>([])

  useEffect(() => {
    return listenForAllCharityTxns(setTxns)
  }, [])

  return txns
}
