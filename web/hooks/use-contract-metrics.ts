import { useCallback, useEffect, useState } from 'react'
import { listenForValues } from 'web/lib/firebase/utils'
import {
  collectionGroup,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore'
import { db } from 'web/lib/firebase/init'
import {
  CONTRACT_METRICS_SORTED_INDICES,
  ContractMetricsByOutcome,
} from 'web/lib/firebase/contract-metrics'
import { ContractMetric } from 'common/contract-metric'
import { SupabaseClient } from 'common/supabase/utils'
import { useValuesOnContract } from 'web/lib/supabase/utils'

export const useContractMetrics = (
  contractId: string,
  count: number,
  outcomes: string[]
) => {
  const [contractMetrics, setContractMetrics] = useState<
    ContractMetricsByOutcome | undefined
  >()

  useEffect(() => {
    if (!contractId) return
    const listeners = outcomes.map((outcome) =>
      listenForContractMetricsOnContract(
        contractId,
        (cm) =>
          setContractMetrics((prev) => {
            // We filter yes and no outcomes on the query side
            const filtered =
              outcome !== 'YES' && outcome !== 'NO'
                ? cm.filter(
                    (c) =>
                      c.totalShares[outcome] && c.totalShares[outcome] > 0.1
                  )
                : cm
            const resultsAlreadySorted =
              CONTRACT_METRICS_SORTED_INDICES.includes(outcome)
            if (resultsAlreadySorted) {
              return { ...prev, [outcome]: filtered }
            } else {
              const sorted = filtered.sort(
                (a, b) => b.totalShares[outcome] - a.totalShares[outcome]
              )
              return { ...prev, [outcome]: sorted }
            }
          }),
        {
          count,
          sortedOutcome: CONTRACT_METRICS_SORTED_INDICES.includes(outcome)
            ? outcome
            : undefined,
        }
      )
    )

    return () => {
      listeners?.forEach((l) => l())
    }
  }, [count, contractId, outcomes.length])

  return contractMetrics
}

// If you want shares sorted in descending order you have to make a new index for that outcome.
// You can still get all users with contract-metrics and shares without the index and sort them in the client
export function listenForContractMetricsOnContract(
  contractId: string,
  setMetrics: (metrics: ContractMetric[]) => void,
  options: {
    sortedOutcome: typeof CONTRACT_METRICS_SORTED_INDICES[number] | undefined
    count: number
  }
) {
  const { sortedOutcome, count } = options
  if (sortedOutcome) {
    const sortedQuery = query(
      collectionGroup(db, 'contract-metrics'),
      where('contractId', '==', contractId),
      // This allows us to skip filtering the metrics by outcome in the client
      where(
        sortedOutcome === 'YES'
          ? 'hasYesShares'
          : sortedOutcome === 'NO'
          ? 'hasNoShares'
          : 'hasShares',
        '==',
        true
      ),
      orderBy('totalShares.' + sortedOutcome, 'desc'),
      limit(count)
    )
    return listenForValues<ContractMetric>(sortedQuery, setMetrics)
  } else {
    const unsortedQuery = query(
      collectionGroup(db, 'contract-metrics'),
      where('contractId', '==', contractId),
      where('hasShares', '==', true),
      limit(count)
    )
    return listenForValues<ContractMetric>(unsortedQuery, setMetrics)
  }
}

export function useSupabaseContractMetrics(
  contractId: string,
  db: SupabaseClient,
  sort: 'shares' | 'profit',
  limit: number
) {
  const loadInitialValuesBySharesForContractId = async () => {
    const { data: yesShares } = await db
      .from('user_contract_metrics')
      .select('*')
      .eq('contract_id', contractId)
      .eq('data->>hasYesShares', true)
      .order('data->totalShares->YES', {
        ascending: false,
        nullsFirst: false,
      } as any)
      .limit(limit)
    const { data: noShares } = await db
      .from('user_contract_metrics')
      .select('*')
      .eq('contract_id', contractId)
      .eq('data->>hasNoShares', true)
      .order(`data->totalShares->NO`, {
        ascending: false,
        nullsFirst: false,
      } as any)
      .limit(limit)
    return [...(yesShares ?? []), ...(noShares ?? [])]
  }
  const loadInitialValuesByProfitForContractId = async () => {
    const { data: positiveProfit } = await db
      .from('user_contract_metrics')
      .select('*')
      .eq('contract_id', contractId)
      .gt('data->profit', 0)
      .order(`data->profit`, { ascending: false, nullsFirst: false } as any)
      .limit(limit)
    const { data: negativeProfit } = await db
      .from('user_contract_metrics')
      .select('*')
      .eq('contract_id', contractId)
      .lt('data->profit', 0)
      .order(`data->profit`, { ascending: true, nullsFirst: false } as any)
      .limit(limit)
    return [...(positiveProfit ?? []), ...(negativeProfit ?? [])]
  }
  const initalValueCallback = useCallback(
    () =>
      sort === 'shares'
        ? loadInitialValuesBySharesForContractId()
        : loadInitialValuesByProfitForContractId(),
    [limit, sort]
  )
  return useValuesOnContract(
    'user_contract_metrics',
    'user_id',
    contractId,
    db,
    initalValueCallback
  ) as ContractMetric[] | undefined
}
