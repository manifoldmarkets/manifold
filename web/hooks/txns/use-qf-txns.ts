import { QfTxn } from 'common/txn'
import { useState, useEffect } from 'react'
import { listenForQfTxns } from 'web/lib/firebase/txns/qf'

export function useQfTxns(qfId: string) {
  const [txns, setTxns] = useState<QfTxn[]>([])

  useEffect(() => {
    return listenForQfTxns(qfId, setTxns)
  }, [qfId])

  return txns
}
