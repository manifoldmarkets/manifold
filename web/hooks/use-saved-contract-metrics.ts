import { ContractMetric, isSummary } from 'common/contract-metric'
import { Contract } from 'common/contract'
import { getTopContractMetrics } from 'common/supabase/contract-metrics'
import { db } from 'web/lib/supabase/db'
import { useEffect, useRef, useState } from 'react'
import { usePersistentLocalState } from './use-persistent-local-state'
import { useEvent } from 'client-common/hooks/use-event'
import { useApiSubscription } from 'client-common/hooks/use-api-subscription'
import { calculateUpdatedMetricsForContracts } from 'common/calculate-metrics'
import { useUser } from './use-user'
import { uniqBy } from 'lodash'
import { useBatchedGetter } from 'client-common/hooks/use-batched-getter'
import { queryHandlers } from 'web/lib/supabase/batch-query-handlers'

export const useSavedContractMetrics = (
  contract: Contract,
  answerId?: string
) => {
  const allMetrics = useAllSavedContractMetrics(contract, answerId)
  return allMetrics?.find((m) =>
    answerId ? m.answerId === answerId : isSummary(m)
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
  const generation = useRef(0)
  const updateMetricsWithNewProbs = useEvent((metrics: ContractMetric[]) => {
    if (!user) return metrics
    const { metricsByContract } = calculateUpdatedMetricsForContracts([
      { contract, metrics },
    ])
    return metricsByContract[contract.id] as ContractMetric[]
  })
  useEffect(() => {
    setSavedMetrics(updateMetricsWithNewProbs(savedMetrics ?? []))
  }, [
    'answers' in contract
      ? JSON.stringify(contract.answers)
      : contract.lastBetTime,
  ])

  const refreshMyMetrics = useEvent(async () => {
    if (!user?.id) return
    const request = ++generation.current

    let q = db
      .from('user_contract_metrics')
      .select('data, margin_loan, loan')
      .eq('contract_id', contract.id)
      .eq('user_id', user.id)
    if (answerId) q = q.eq('answer_id', answerId)
    const { data, error } = await q
    if (error) throw error
    if (request !== generation.current) return
    const metrics = (data as any[] | null)?.map((m) => ({
      ...(m.data as ContractMetric),
      loan: m.loan ?? (m.data as any).loan ?? 0,
      marginLoan: m.margin_loan ?? (m.data as any).marginLoan ?? 0,
    })) as ContractMetric[]

    if (!metrics.length) {
      setSavedMetrics([])
      return
    }
    setSavedMetrics(updateMetricsWithNewProbs(metrics))
  })

  // For some reason all of the deps trigger this effect the very first time the bet summary is rendered
  useEffect(() => {
    refreshMyMetrics().catch(console.error)
    return () => {
      generation.current++
    }
  }, [user?.id, contract.id, answerId, contract.resolution])

  const applyUpdate = useEvent(
    async (newMetrics: Omit<ContractMetric, 'id'>[]) => {
      generation.current++
      const metrics = newMetrics.filter((m) =>
        answerId ? m.answerId === answerId : true
      ) as ContractMetric[]
      if (metrics.length > 0)
        setSavedMetrics(
          uniqBy(
            [...metrics, ...(savedMetrics ?? [])],
            (m) => m.answerId + m.userId + m.contractId
          )
        )
    }
  )

  useApiSubscription({
    topics: [`contract/${contract.id}/user-metrics/${user?.id}`],
    recoveryKey: answerId,
    getSnapshot: async (signal) => {
      const request = ++generation.current
      let query = db
        .from('user_contract_metrics')
        .select('data, margin_loan, loan')
        .eq('contract_id', contract.id)
        .eq('user_id', user!.id)
      if (answerId) query = query.eq('answer_id', answerId)
      // These balance columns predate their generated Supabase typings.
      const { data, error } = await query.abortSignal(signal).returns<
        {
          data: ContractMetric
          loan: number | null
          margin_loan: number | null
        }[]
      >()
      if (error) throw error
      const result = data.map((row) => ({
        ...(row.data as ContractMetric),
        loan: row.loan ?? (row.data as ContractMetric).loan ?? 0,
        marginLoan:
          row.margin_loan ?? (row.data as ContractMetric).marginLoan ?? 0,
      }))
      return () => {
        if (request !== generation.current) return false
        setSavedMetrics(updateMetricsWithNewProbs(result))
      }
    },
    onBroadcast: (msg) =>
      applyUpdate(msg.data.metrics as Omit<ContractMetric, 'id'>[]),
    enabled: !!user?.id,
  })

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
    queryHandlers,
    'contract-metrics',
    contractId,
    false,
    !!user?.id,
    user?.id
  )

  return hasMetric
}
