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
    if (!user?.id) return
    // Wait a small amount for the bet to replicate to supabase
    const queryAndSet = async (retries: number) =>
      setTimeout(() => {
        getUserContractMetrics(user.id, contract.id, db).then((metrics) => {
          if (metrics.length)
            setSavedMetrics({ ...savedMetrics, ...metrics[0] })
          else if (retries > 0) queryAndSet(retries - 1)
        })
      }, 50)
    queryAndSet(2)
  }, [user?.id, contract.id, contract.lastBetTime])

  return savedMetrics
}
