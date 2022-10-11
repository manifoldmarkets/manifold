import { useContext } from 'react'
import {
  useFirestoreDocumentData,
  useFirestoreQueryData,
} from '@react-query-firebase/firestore'
import { useQuery, useQueryClient } from 'react-query'

import { doc, DocumentData } from 'firebase/firestore'
import { getUser, User, users } from 'web/lib/firebase/users'
import { AuthContext } from 'web/components/auth-context'
import { ContractMetrics } from 'common/calculate-metrics'
import { getUserContractMetricsQuery } from 'web/lib/firebase/contract-metrics'
import { getContractFromId } from 'web/lib/firebase/contracts'
import { buildArray, filterDefined } from 'common/util/array'
import { CPMMBinaryContract } from 'common/contract'

export const useUser = () => {
  const authUser = useContext(AuthContext)
  return authUser ? authUser.user : authUser
}

export const usePrivateUser = () => {
  const authUser = useContext(AuthContext)
  return authUser ? authUser.privateUser : authUser
}

export const useUserById = (userId = '_') => {
  const result = useFirestoreDocumentData<DocumentData, User>(
    ['users', userId],
    doc(users, userId),
    { subscribe: true, includeMetadataChanges: true }
  )

  if (userId === '_') return undefined

  return result.isLoading ? undefined : result.data
}

export const usePrefetchUser = (userId: string) => {
  return usePrefetchUsers([userId])[0]
}

export const usePrefetchUsers = (userIds: string[]) => {
  const queryClient = useQueryClient()
  return userIds.map((userId) =>
    queryClient.prefetchQuery(['users', userId], () => getUser(userId))
  )
}

export const useUserContractMetricsByProfit = (
  userId: string,
  count: number
) => {
  const positiveResult = useFirestoreQueryData<ContractMetrics>(
    ['contract-metrics-descending', userId, count],
    getUserContractMetricsQuery(userId, count, 'desc')
  )
  const negativeResult = useFirestoreQueryData<ContractMetrics>(
    ['contract-metrics-ascending', userId, count],
    getUserContractMetricsQuery(userId, count, 'asc')
  )

  const metrics = buildArray(positiveResult.data, negativeResult.data)
  const contractIds = metrics.map((m) => m.contractId)

  const contractResult = useQuery(['contracts', contractIds], () =>
    Promise.all(contractIds.map(getContractFromId))
  )
  const contracts = contractResult.data

  if (!positiveResult.data || !negativeResult.data || !contracts)
    return undefined

  const filtered = filterDefined(contracts) as CPMMBinaryContract[]
  return { contracts: filtered, metrics }
}

export const useUserContractMetrics = (userId = '_', contractId: string) => {
  const result = useFirestoreDocumentData<DocumentData, ContractMetrics>(
    ['user-contract-metrics', userId, contractId],
    doc(users, userId, 'contract-metrics', contractId)
  )

  if (userId === '_') return undefined

  return result.data
}
