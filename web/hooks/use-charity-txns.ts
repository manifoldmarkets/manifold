import { useEffect, useState } from 'react'
import { Txn } from '../../common/txn'
import { listenForCharityTxns } from '../lib/firebase/txns'

export const useCharityTxns = (charityId: string) => {
  const [txns, setTxns] = useState<Txn[]>([])

  useEffect(() => {
    return listenForCharityTxns(charityId, setTxns)
  }, [charityId])

  return txns
}
