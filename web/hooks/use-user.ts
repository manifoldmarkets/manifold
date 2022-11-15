import { useContext, useRef } from 'react'
import { useFirestoreQueryData } from '@react-query-firebase/firestore'
import { sortBy } from 'lodash'

import { doc } from 'firebase/firestore'
import { listenForUser, users } from 'web/lib/firebase/users'
import { AuthContext } from 'web/components/auth-context'
import { ContractMetrics } from 'common/calculate-metrics'
import { getUserContractMetricsQuery } from 'web/lib/firebase/contract-metrics'
import { buildArray, filterDefined } from 'common/util/array'
import { Contract, CPMMBinaryContract } from 'common/contract'
import { useContracts } from './use-contracts'
import { useStore, useStoreItems } from './use-store'
import { safeLocalStorage } from 'web/lib/util/local'
import { useEffectCheckEquality } from './use-effect-check-equality'
import { listenForValue } from 'web/lib/firebase/utils'

export const useUser = () => {
  const authUser = useContext(AuthContext)
  return authUser ? authUser.user : authUser
}

export const usePrivateUser = () => {
  const authUser = useContext(AuthContext)
  return authUser ? authUser.privateUser : authUser
}

export const useUserById = (userId: string | undefined) => {
  return useStore(userId, listenForUser)
}

export const useUsersById = (userIds: string[]) => {
  return useStoreItems(userIds, listenForUser)
}

export const usePrefetchUsers = (userIds: string[]) => {
  useStoreItems(userIds, listenForUser)
}

// Note: we don't filter out blocked contracts/users/groups here like we do in unbet-on contracts
export const useUserContractMetricsByProfit = (userId: string, count = 50) => {
  const positiveResult = useFirestoreQueryData<ContractMetrics>(
    ['contract-metrics-descending', userId, count],
    getUserContractMetricsQuery(userId, count, 'desc')
  )
  const negativeResult = useFirestoreQueryData<ContractMetrics>(
    ['contract-metrics-ascending', userId, count],
    getUserContractMetricsQuery(userId, count, 'asc')
  )

  const metrics = buildArray(positiveResult.data, negativeResult.data)
  const contractIds = sortBy(metrics.map((m) => m.contractId))
  const contracts = useContracts(contractIds)

  const isReady =
    positiveResult.data &&
    negativeResult.data &&
    !contracts.some((c) => c === undefined)

  const savedResult = useRef<
    | {
        metrics: ContractMetrics[]
        contracts: (Contract | null)[]
      }
    | undefined
  >(undefined)

  const result = isReady
    ? {
        metrics,
        contracts: contracts as (Contract | null)[],
      }
    : savedResult.current

  useEffectCheckEquality(() => {
    const key = `user-contract-metrics-${userId}`
    if (isReady) {
      safeLocalStorage()?.setItem(key, JSON.stringify(result))
    } else if (!result) {
      const saved = safeLocalStorage()?.getItem(key)
      if (saved) {
        savedResult.current = JSON.parse(saved)
      }
    }
  }, [isReady, result, userId])

  if (!result) return undefined

  const filteredContracts = filterDefined(
    result.contracts
  ) as CPMMBinaryContract[]
  const filteredMetrics = result.metrics
    .filter((m) => m.from && Math.abs(m.from.day.profit) >= 1)
    .filter((m) => filteredContracts.find((c) => c.id === m.contractId))

  return { contracts: filteredContracts, metrics: filteredMetrics }
}

export const useUserContractMetrics = (userId = '_', contractId: string) => {
  const metricsDoc = doc(users, userId, 'contract-metrics', contractId)

  const data = useStore<ContractMetrics | null>(
    ['user-contract-metrics', userId, contractId].join('/'),
    (_, setValue) => listenForValue(metricsDoc, setValue)
  )

  if (userId === '_') return undefined

  return data
}
