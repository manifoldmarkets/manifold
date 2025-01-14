import { useApiSubscription } from 'client-common/hooks/use-api-subscription'
import { Contract } from 'common/contract'
import { ContractMetric } from 'common/contract-metric'
import { useEffect } from 'react'
import { useUser } from './use-user'
import { usePersistentLocalState } from './use-persistent-local-state'
import { useEvent } from 'client-common/hooks/use-event'
import { calculateUpdatedMetricsForContracts } from 'common/calculate-metrics'
import { api } from 'lib/api'

export const useSavedContractMetrics = (
  contract: Contract,
  answerId?: string
) => {
  const allMetrics = useAllSavedContractMetrics(contract, answerId)
  return allMetrics?.find((m) =>
    answerId ? m.answerId === answerId : m.answerId == null
  )
}

export const useAllSavedContractMetrics = (
  contract: Contract,
  answerId?: string
) => {
  const user = useUser()
  const [savedMetrics, setSavedMetrics] = usePersistentLocalState<
    ContractMetric[] | undefined
  >(undefined, `contract-metrics-${contract.id}-${answerId}-saved`)

  const updateMetricsWithNewProbs = (metrics: ContractMetric[]) => {
    if (!user) return metrics
    const { metricsByContract } = calculateUpdatedMetricsForContracts([
      { contract, metrics },
    ])
    return metricsByContract[contract.id] as ContractMetric[]
  }

  const refreshMyMetrics = useEvent(async () => {
    if (!user?.id) return

    const metrics = await api('market/:id/positions', {
      id: contract.id,
      userId: user.id,
      answerId,
    })

    if (!metrics.length) {
      setSavedMetrics([])
      return
    }
    setSavedMetrics(updateMetricsWithNewProbs(metrics))
  })

  useEffect(() => {
    refreshMyMetrics()
  }, [user?.id, contract.id, answerId, contract.resolution])

  useApiSubscription({
    topics: [`contract/${contract.id}/user-metrics/${user?.id}`],
    onBroadcast: (msg) => {
      const metrics = (msg.data.metrics as Omit<ContractMetric, 'id'>[]).filter(
        (m) => (answerId ? m.answerId === answerId : true)
      )
      if (metrics.length > 0) setSavedMetrics(metrics as ContractMetric[])
    },
    enabled: !!user?.id,
  })

  return savedMetrics
}
