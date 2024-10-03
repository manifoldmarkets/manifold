import { ContractMetric } from 'common/contract-metric'
import { Contract } from 'common/contract'
import { useUser } from './use-user'
import { uniqBy } from 'lodash'
import {
  getTopContractMetrics,
  getUserContractMetrics,
  getUserContractMetricsForAnswers,
} from 'common/supabase/contract-metrics'
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

export const useSavedContractMetrics = (
  contract: Contract,
  answerId?: string
) => {
  const user = useUser()
  const [newBets, setNewBets] = useState<Bet[]>([])
  const [savedMetrics, setSavedMetrics] = usePersistentLocalState<
    ContractMetric[] | undefined
  >(undefined, `contract-metrics-${contract.id}-${answerId}-4`)
  const [newMetric, setNewMetric] = usePersistentLocalState<
    ContractMetric | undefined
  >(undefined, `contract-metrics-${contract.id}-new-${answerId}-4`)

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

    const fetchMetrics = async () => {
      if (contract.mechanism === 'cpmm-multi-1' && !answerId) {
        return await getUserContractMetricsForAnswers(user.id, contract.id, db)
      }
      return await getUserContractMetrics(user.id, contract.id, db, answerId)
    }

    const metrics = await fetchMetrics()
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
    const updatedAnswerMetrics = calculateAnswerMetricsWithNewBetsOnly(
      newBets,
      metrics,
      contract.id,
      contract.mechanism === 'cpmm-multi-1'
    )

    const updatedMetrics = updateMetricsWithNewProbs(
      updatedAnswerMetrics as ContractMetric[]
    )
    const newestMetric = updatedMetrics.find((m) =>
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
