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
import {
  calculateProfitMetricsWithProb,
  getDefaultMetric,
  applyMetricToSummary,
} from 'common/calculate-metrics'
import { useUser } from './use-user'
import { useBatchedGetter } from './use-batched-getter'

export const useSavedContractMetrics = (
  contract: Contract,
  answerId?: string
) => {
  const user = useUser()
  const [savedMetrics, setSavedMetrics] = usePersistentLocalState<
    ContractMetric[] | undefined
  >(undefined, `contract-metrics-${contract.id}-${answerId}-saved`)

  const updateMetricsWithNewProbs = (metrics: ContractMetric[]) => {
    if (!user) return metrics
    if (contract.mechanism === 'cpmm-1') {
      return [calculateProfitMetricsWithProb(contract.prob, metrics[0])]
    }
    if (contract.mechanism === 'cpmm-multi-1') {
      const updatedMetrics = metrics.map((metric) => {
        const answer = contract.answers.find((a) => a.id === metric.answerId)
        return answer
          ? calculateProfitMetricsWithProb(
              answer.resolution === 'YES'
                ? 1
                : answer.resolution === 'NO'
                ? 0
                : answer.prob,
              metric
            )
          : metric
      })
      const nonNullMetrics = updatedMetrics.filter((m) => m.answerId != null)
      const nullMetric = getDefaultMetric(user.id, contract.id, null)
      nonNullMetrics.forEach((m) => applyMetricToSummary(m, nullMetric, true))
      return [...nonNullMetrics, nullMetric] as ContractMetric[]
    }
    return metrics
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
      const metrics = (msg.data.metrics as ContractMetric[]).filter((m) =>
        answerId ? m.answerId === answerId : true
      )
      if (metrics.length > 0) setSavedMetrics(metrics)
    },
    enabled: !!user?.id,
  })

  return savedMetrics?.find((m) =>
    answerId ? m.answerId === answerId : m.answerId == null
  )
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
