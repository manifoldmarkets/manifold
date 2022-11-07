import { CertTxn } from 'common/txn'
import { useState, useEffect } from 'react'
import { listenForCertTxns } from 'web/lib/firebase/txns/cert'

export function useCertTxns(certId: string) {
  const [txns, setTxns] = useState<CertTxn[]>([])

  useEffect(() => {
    return listenForCertTxns(certId, setTxns)
  }, [certId])

  return txns
}
