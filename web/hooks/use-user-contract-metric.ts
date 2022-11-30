import { useEffect, useState } from 'react'
import { listenForValue } from 'web/lib/firebase/utils'
import { collection, doc } from 'firebase/firestore'
import { db } from 'web/lib/firebase/init'

import { ContractMetric } from 'common/contract-metric'

export const useUserContractMetric = (
  userId: string | null | undefined,
  contractId: string
) => {
  const [contractMetrics, setContractMetrics] = useState<
    ContractMetric | undefined | null
  >()

  useEffect(() => {
    if (!userId) return
    return listenForUserContractMetric(userId, contractId, setContractMetrics)
  }, [userId, contractId])

  return contractMetrics
}

export function listenForUserContractMetric(
  userId: string,
  contractId: string,
  setMetrics: (metrics: ContractMetric | null) => void
) {
  const q = collection(db, `users/${userId}/contract-metrics/`)

  return listenForValue<ContractMetric>(doc(q, contractId), setMetrics)
}
