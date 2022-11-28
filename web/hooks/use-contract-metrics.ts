import { useEffect, useState } from 'react'
import { listenForValues } from 'web/lib/firebase/utils'
import {
  collectionGroup,
  limit,
  orderBy,
  query,
  where,
  Unsubscribe,
} from 'firebase/firestore'
import { db } from 'web/lib/firebase/init'
import { BinaryContractMetricsByOutcome } from 'web/lib/firebase/contract-metrics'
import { ContractMetric } from 'common/contract-metric'

const outcomes = ['YES', 'NO'] as const
export const useBinaryContractMetrics = (contractId: string, count: number) => {
  const cmbo = {} as BinaryContractMetricsByOutcome
  outcomes.forEach((outcome) => (cmbo[outcome] = []))
  const [contractMetrics, setContractMetrics] =
    useState<BinaryContractMetricsByOutcome>(cmbo)

  useEffect(() => {
    let listeners: Unsubscribe[] | undefined

    if (contractId) {
      listeners = outcomes.map((outcome) =>
        listenForBinaryContractMetricsOnContract(
          contractId,
          count,
          outcome,
          (cm) =>
            setContractMetrics((prev) => ({
              ...prev,
              [outcome]: cm,
            }))
        )
      )
    }
    return () => {
      listeners?.forEach((l) => l())
    }
  }, [count, contractId])

  return contractMetrics
}

export function listenForBinaryContractMetricsOnContract(
  contractId: string,
  count: number,
  outcome: 'YES' | 'NO',
  setMetrics: (metrics: ContractMetric[]) => void
) {
  const yesQuery = query(
    collectionGroup(db, 'contract-metrics'),
    where('contractId', '==', contractId),
    where(outcome === 'YES' ? 'hasYesShares' : 'hasNoShares', '==', true),
    orderBy('totalShares.' + outcome, 'desc'),
    limit(count)
  )

  return listenForValues<ContractMetric>(yesQuery, setMetrics)
}
