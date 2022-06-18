import { useEffect, useState } from 'react'
import { DonationTxn } from 'common/txn'
import { listenForCharityTxns } from 'web/lib/firebase/txns'

export const useCharityTxns = (charityId: string) => {
  const [txns, setTxns] = useState<DonationTxn[]>([])

  useEffect(() => {
    return listenForCharityTxns(charityId, setTxns)
  }, [charityId])

  return txns
}
