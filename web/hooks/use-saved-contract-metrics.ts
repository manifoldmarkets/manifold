import { ContractMetric } from 'common/contract-metric'
import { Contract } from 'common/contract'
import { useUser } from './use-user'
import { getUserContractMetrics } from 'common/supabase/contract-metrics'
import { db } from 'web/lib/supabase/db'
import { useEffect } from 'react'
import { usePersistentLocalState } from './use-persistent-local-state'

export const useSavedContractMetrics = (contract: Contract) => {
  const user = useUser()

  const [savedMetrics, setSavedMetrics] = usePersistentLocalState<
    ContractMetric | undefined
  >(undefined, `contract-metrics-${contract.id}`)

  useEffect(() => {
    getUserContractMetrics(user?.id ?? '_', contract.id, db).then((metrics) => {
      if (metrics.length) setSavedMetrics({ ...savedMetrics, ...metrics[0] })
    }),
      []
  })

  return savedMetrics
}
