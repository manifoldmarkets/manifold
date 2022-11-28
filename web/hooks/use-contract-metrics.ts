import { useEffect, useState } from 'react'
import { ContractMetrics } from 'common/calculate-metrics'
import { listenForValues } from 'web/lib/firebase/utils'
import { collectionGroup, orderBy, query, where } from 'firebase/firestore'
import { db } from 'web/lib/firebase/init'

export const useContractMetrics = (contractId: string) => {
  const [contractMetrics, setContractMetrics] = useState<
    ContractMetrics[] | undefined
  >()

  useEffect(() => {
    if (contractId)
      return listenForContractMetricsOnContract(contractId, setContractMetrics)
  }, [contractId])

  return contractMetrics
}
export function listenForContractMetricsOnContract(
  contractId: string,
  setComments: (comments: ContractMetrics[]) => void
) {
  return listenForValues<ContractMetrics>(
    query(
      collectionGroup(db, 'contract-metrics'),
      where('contractId', '==', contractId),
      where('hasShares', '==', true),
      orderBy('createdTime', 'desc')
    ),
    setComments
  )
}
