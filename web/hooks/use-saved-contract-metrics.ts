import { ContractMetric } from 'common/contract-metric'
import { Contract } from 'common/contract'
import { useUser } from './use-user'
import { getUserContractMetrics } from 'common/supabase/contract-metrics'
import { db } from 'web/lib/supabase/db'
import { useEffect } from 'react'
import { usePersistentLocalState } from './use-persistent-local-state'
import { first, isEqual } from 'lodash'

export const useSavedContractMetrics = (
  contract: Contract,
  answerId?: string,
  extraDeps?: any[],
  retry = 2
) => {
  const user = useUser()

  const [savedMetrics, setSavedMetrics] = usePersistentLocalState<
    ContractMetric | undefined
  >(undefined, `contract-metrics-${contract.id}`)

  useEffect(() => {
    if (!user?.id) return
    // Wait a small amount for the bet to replicate to supabase
    const queryAndSet = async (retries: number) =>
      setTimeout(() => {
        getUserContractMetrics(user.id, contract.id, db, answerId).then(
          (metrics) =>
            tryToGetDifferentMetricsThanSaved(
              savedMetrics,
              metrics,
              retries,
              setSavedMetrics,
              queryAndSet
            )
        )
      }, 50)
    queryAndSet(retry)
  }, [user?.id, contract.id, contract.lastBetTime, ...(extraDeps ?? [])])

  return savedMetrics
}

const tryToGetDifferentMetricsThanSaved = (
  savedMetrics: ContractMetric | undefined,
  metrics: ContractMetric[] | undefined,
  retries: number,
  setSavedMetrics: (metric: ContractMetric | undefined) => void,
  queryAndSet: (retries: number) => void
) => {
  const metric = first(metrics)
  if (metric && !savedMetrics) setSavedMetrics(metric)
  else if (metric && savedMetrics && retries > 0) {
    // If we get the same metric as the saved one, retry to make sure we have the latest
    if (isEqual(metric, savedMetrics)) {
      queryAndSet(retries - 1)
    } else setSavedMetrics({ ...savedMetrics, ...metric })
  } else if (metric && savedMetrics && retries === 0) {
    setSavedMetrics({ ...savedMetrics, ...metric })
  } else if (retries > 0) queryAndSet(retries - 1)
}
