import { ContractMetric } from 'common/contract-metric'
import { Contract } from 'common/contract'
import { usePersistentState, storageStore } from './use-persistent-state'
import { useUser } from './use-user'
import { safeLocalStorage } from 'web/lib/util/local'
import { getUserContractMetrics } from 'common/supabase/contract-metrics'
import { db } from 'web/lib/supabase/db'
import { useEffect } from 'react'

export const useSavedContractMetrics = (contract: Contract) => {
  const user = useUser()

  const [savedMetrics, setSavedMetrics] = usePersistentState<
    ContractMetric | undefined
  >(undefined, {
    key: `contract-metrics-${contract.id}`,
    store: storageStore(safeLocalStorage),
  })

  useEffect(() => {
    getUserContractMetrics(user?.id ?? '_', contract.id, db).then((metrics) => {
      if (metrics.length) setSavedMetrics({ ...savedMetrics, ...metrics[0] })
    }),
      []
  })

  return savedMetrics
}
