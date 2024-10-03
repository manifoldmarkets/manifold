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
} from 'common/calculate-metrics'

export const useSavedContractMetrics = (
  contract: Contract,
  answerId?: string
) => {
  const user = useUser()
  const [newBets, setNewBets] = useState<Bet[]>([])
  const [savedMetrics, setSavedMetrics] = usePersistentLocalState<
    ContractMetric[] | undefined
  >(undefined, `contract-metrics-${contract.id}-${answerId}-1`)
  const [newMetric, setNewMetric] = usePersistentLocalState<
    ContractMetric | undefined
  >(undefined, `contract-metrics-${contract.id}-new-${answerId}-1`)

  const refreshMyMetrics = useEvent(async () => {
    if (!user?.id) return
    if (contract.mechanism == 'cpmm-1' || answerId) {
      // get null metrics
      const metrics = await getUserContractMetrics(
        user.id,
        contract.id,
        db,
        answerId
      )
      const metric = metrics[0]
      if (!metric) {
        return
      }
      if (answerId && contract.mechanism == 'cpmm-multi-1') {
        const answer = contract.answers.find((a) => a.id === answerId)
        if (!answer) {
          setSavedMetrics([metric])
          return
        }
        const updatedMetrics = calculateProfitMetricsWithProb(
          answer.prob,
          metric
        )
        setSavedMetrics([updatedMetrics as ContractMetric])
      } else if (contract.mechanism == 'cpmm-1') {
        setSavedMetrics([calculateProfitMetricsWithProb(contract.prob, metric)])
      }
    } else if (contract.mechanism == 'cpmm-multi-1') {
      const allAnswerMetrics = await getUserContractMetricsForAnswers(
        user.id,
        contract.id,
        db
      )
      setSavedMetrics(
        allAnswerMetrics.map((metric) => {
          const answer = contract.answers.find((a) => a.id == metric.answerId)
          if (!answer) return metric
          return calculateProfitMetricsWithProb(answer.prob, metric)
        })
      )
    }
  })

  useEffect(() => {
    refreshMyMetrics()
  }, [user?.id, contract.id, answerId])

  useApiSubscription({
    topics: [`contract/${contract.id}/new-bet`],
    onBroadcast: (msg) => {
      const myNewBets = (msg.data.bets as Bet[]).filter((bet) =>
        bet.userId === user?.id && answerId ? bet.answerId == answerId : true
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
      contract.mechanism == 'cpmm-multi-1'
    )

    if (contract.mechanism == 'cpmm-1') {
      const nullMetric = updatedAnswerMetrics.find((a) => a.answerId == null)
      if (!nullMetric) return
      const updatedMetrics = calculateProfitMetricsWithProb(
        contract.prob,
        nullMetric
      )
      setNewMetric(updatedMetrics as ContractMetric)
    } else if (contract.mechanism == 'cpmm-multi-1') {
      const updatedMetrics = updatedAnswerMetrics.map((metric) => {
        const answer = contract.answers.find((a) => a.id == metric.answerId)
        if (!answer) return metric
        return calculateProfitMetricsWithProb(answer.prob, metric)
      })

      setNewMetric(
        updatedMetrics.find((a) =>
          answerId ? a.answerId == answerId : a.answerId == null
        ) as ContractMetric
      )
    }
  }, [
    newBets.length, // handles our own new bets
    contract.lastBetTime, // handles prob changes
  ])

  return (newMetric ??
    savedMetrics?.find((m) =>
      answerId ? m.answerId == answerId : m.answerId == null
    )) as ContractMetric | undefined
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
