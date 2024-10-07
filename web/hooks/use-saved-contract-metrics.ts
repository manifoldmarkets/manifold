import { ContractMetric } from 'common/contract-metric'
import { Contract } from 'common/contract'
import { useUser } from './use-user'
import { uniqBy } from 'lodash'
import { getTopContractMetrics } from 'common/supabase/contract-metrics'
import { db } from 'web/lib/supabase/db'
import { useEffect, useState } from 'react'
import { usePersistentLocalState } from './use-persistent-local-state'
import { useEvent } from 'web/hooks/use-event'
import { useApiSubscription } from 'web/hooks/use-api-subscription'
import { Bet } from 'common/bet'
import {
  calculateProfitMetricsWithProb,
  calculateAnswerMetricsWithNewBetsOnly,
  getDefaultMetric,
  applyMetricToSummary,
} from 'common/calculate-metrics'
import { api } from 'web/lib/api/api'
import { removeUndefinedProps } from 'common/util/object'

export const useSavedContractMetrics = (
  contract: Contract,
  answerId?: string
) => {
  const user = useUser()
  const [newBets, setNewBets] = useState<Bet[]>([])
  const [savedMetrics, setSavedMetrics] = usePersistentLocalState<
    ContractMetric[] | undefined
  >(undefined, `contract-metrics-${contract.id}-${answerId}-saved`)
  const [newMetric, setNewMetric] = usePersistentLocalState<
    ContractMetric | undefined
  >(undefined, `contract-metrics-${contract.id}-new-${answerId}-new`)

  const updateMetricsWithNewProbs = (metrics: ContractMetric[]) => {
    if (!user) return metrics
    if (contract.mechanism === 'cpmm-1') {
      return [calculateProfitMetricsWithProb(contract.prob, metrics[0])]
    }
    if (contract.mechanism === 'cpmm-multi-1') {
      const updatedMetrics = metrics.map((metric) => {
        const answer = contract.answers.find((a) => a.id === metric.answerId)
        return answer
          ? calculateProfitMetricsWithProb(answer.prob, metric)
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

    const metrics = await await api(
      `market/:id/positions`,
      removeUndefinedProps({
        id: contract.id,
        userId: user.id,
        answerId,
      })
    )
    if (!metrics.length) return
    setSavedMetrics(updateMetricsWithNewProbs(metrics))
    setNewMetric(undefined)
  })

  useEffect(() => {
    refreshMyMetrics()
  }, [user?.id, contract.id, answerId])

  useApiSubscription({
    topics: [`contract/${contract.id}/new-bet`],
    onBroadcast: (msg) => {
      const myNewBets = (msg.data.bets as Bet[]).filter(
        (bet) =>
          bet.userId === user?.id &&
          (answerId ? bet.answerId === answerId : true)
      )
      setNewBets((prevBets) =>
        uniqBy([...prevBets, ...myNewBets], (bet) => bet.id)
      )
    },
    enabled: !!user?.id,
  })

  useEffect(() => {
    if (!newBets.length) return
    const metrics = savedMetrics ?? []
    const metricsWithNewBets = calculateAnswerMetricsWithNewBetsOnly(
      newBets,
      metrics,
      contract.id,
      contract.mechanism === 'cpmm-multi-1'
    )

    const updatedMetrics = [
      ...metricsWithNewBets,
      ...metrics.filter(
        (m) => !metricsWithNewBets.some((um) => um.answerId == m.answerId)
      ),
    ] as ContractMetric[]
    const newestMetrics = updateMetricsWithNewProbs(updatedMetrics)
    const newestMetric = newestMetrics.find((m) =>
      answerId ? m.answerId === answerId : m.answerId == null
    )
    setNewMetric(newestMetric)
  }, [newBets.length, contract.lastBetTime])

  return (
    newMetric ??
    savedMetrics?.find((m) =>
      answerId ? m.answerId === answerId : m.answerId == null
    )
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
  isPlay: boolean
}) => {
  const {
    playContract,
    cashContract,
    defaultTopManaTraders,
    defaultTopCashTraders,
    isPlay,
  } = props

  const [topManaTraders, setTopManaTraders] = useState<ContractMetric[]>(
    defaultTopManaTraders
  )
  const [topCashTraders, setTopCashTraders] = useState<ContractMetric[]>(
    defaultTopCashTraders
  )

  const topContractMetrics = isPlay ? topManaTraders : topCashTraders

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
