import { useContext, useEffect, useState } from 'react'
import { doc } from 'firebase/firestore'
import { listenForUser, users } from 'web/lib/firebase/users'
import { AuthContext } from 'web/components/auth-context'
import { ContractMetric } from 'common/contract-metric'
import { useStore, useStoreItems } from './use-store'
import { listenForValue } from 'web/lib/firebase/utils'
import { PrivateUser } from 'common/user'
import { getShouldBlockDestiny } from 'web/lib/supabase/groups'
import { db } from 'web/lib/supabase/db'

export const useUser = () => {
  const authUser = useContext(AuthContext)
  return authUser ? authUser.user : authUser
}

export const usePrivateUser = () => {
  const authUser = useContext(AuthContext)
  return authUser ? authUser.privateUser : authUser
}

export const useIsAuthorized = () => {
  const authUser = useContext(AuthContext)
  return authUser?.authLoaded || authUser === null ? !!authUser : undefined
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

export const isBlocked = (
  privateUser: PrivateUser | null | undefined,
  otherUserId: string
) => {
  return (
    privateUser?.blockedUserIds.includes(otherUserId) ||
    privateUser?.blockedByUserIds.includes(otherUserId)
  )
}

export const useUserContractMetrics = (userId = '_', contractId: string) => {
  const metricsDoc = doc(users, userId, 'contract-metrics', contractId)

  const data = useStore<ContractMetric | null>(
    ['user-contract-metrics', userId, contractId].join('/'),
    (_, setValue) => listenForValue(metricsDoc, setValue)
  )

  if (userId === '_') return undefined

  return data
}

export const useShouldBlockDestiny = (userId: string | undefined) => {
  const [shouldBlockDestiny, setShouldBlockDestiny] = useState(true)

  useEffect(() => {
    if (userId) {
      getShouldBlockDestiny(userId, db).then((result) =>
        setShouldBlockDestiny(result)
      )
    } else {
      setShouldBlockDestiny(true)
    }
  }, [userId])

  return shouldBlockDestiny
}
