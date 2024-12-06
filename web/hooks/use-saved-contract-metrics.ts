import { ContractMetric } from 'common/contract-metric'
import { Contract } from 'common/contract'
import {
  getTopContractMetrics,
  getUserContractMetrics,
} from 'common/supabase/contract-metrics'
import { db } from 'web/lib/supabase/db'
import { useEffect, useState } from 'react'
import { usePersistentLocalState } from './use-persistent-local-state'
import { useEvent } from 'web/hooks/use-event'
import { useApiSubscription } from 'web/hooks/use-api-subscription'
import { calculateUpdatedMetricsForContracts } from 'common/calculate-metrics'
import { useUser } from './use-user'
import { useBatchedGetter } from './use-batched-getter'

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

    const metrics = await getUserContractMetrics(
      user.id,
      contract.id,
      db,
      answerId
    )

    if (!metrics.length) {
      setSavedMetrics([])
      return
    }
    setSavedMetrics(updateMetricsWithNewProbs(metrics))
  })

  useEffect(() => {
    refreshMyMetrics()
  }, [user?.id, contract.id, answerId])

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

export const useReadLocalContractMetrics = (contractId: string) => {
  const [savedMetrics] = usePersistentLocalState<ContractMetric | undefined>(
    undefined,
    `contract-metrics-${contractId}`
  )
  return savedMetrics
}

export const useTopContractMetrics = (props: {
  playContract: Contract
  cashContract: Contract | null
  defaultTopManaTraders: ContractMetric[]
  defaultTopCashTraders: ContractMetric[]
  prefersPlay: boolean
}) => {
  const {
    playContract,
    cashContract,
    defaultTopManaTraders,
    defaultTopCashTraders,
    prefersPlay,
  } = props

  const [topManaTraders, setTopManaTraders] = useState<ContractMetric[]>(
    defaultTopManaTraders
  )
  const [topCashTraders, setTopCashTraders] = useState<ContractMetric[]>(
    defaultTopCashTraders
  )

  const topContractMetrics = prefersPlay ? topManaTraders : topCashTraders

  // If the contract resolves while the user is on the page, get the top contract metrics
  useEffect(() => {
    if (playContract.resolution) {
      getTopContractMetrics(playContract.id, 10, db).then(setTopManaTraders)
    }
  }, [playContract.resolution])
  useEffect(() => {
    if (cashContract?.resolution) {
      getTopContractMetrics(cashContract.id, 10, db).then(setTopCashTraders)
    }
  }, [cashContract?.resolution])

  return topContractMetrics
}

export const useHasContractMetrics = (contractId: string) => {
  const user = useUser()
  const [hasMetric] = useBatchedGetter<boolean>(
    'contract-metrics',
    contractId,
    false,
    !!user?.id,
    user?.id
  )

  return hasMetric
}
