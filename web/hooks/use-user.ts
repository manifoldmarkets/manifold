import { useEffect, useState } from 'react'
import { useFirestoreDocumentData } from '@react-query-firebase/firestore'
import { QueryClient } from 'react-query'

import { doc, DocumentData, where } from 'firebase/firestore'
import { PrivateUser } from 'common/user'
import {
  getUser,
  listenForLogin,
  listenForPrivateUser,
  listenForUser,
  User,
  users,
} from 'web/lib/firebase/users'
import { useStateCheckEquality } from './use-state-check-equality'
import { identifyUser, setUserProperty } from 'web/lib/service/analytics'

export const useUser = () => {
  const [user, setUser] = useStateCheckEquality<User | null | undefined>(
    undefined
  )

  useEffect(() => listenForLogin(setUser), [setUser])

  useEffect(() => {
    if (user) {
      identifyUser(user.id)
      setUserProperty('username', user.username)

      return listenForUser(user.id, setUser)
    }
  }, [user, setUser])

  return user
}

export const usePrivateUser = (userId?: string) => {
  const [privateUser, setPrivateUser] = useState<
    PrivateUser | null | undefined
  >(undefined)

  useEffect(() => {
    if (userId) return listenForPrivateUser(userId, setPrivateUser)
  }, [userId])

  return privateUser
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

const queryClient = new QueryClient()

export const prefetchUser = (userId: string) => {
  queryClient.prefetchQuery(['users', userId], () => getUser(userId))
}

export const prefetchUsers = (userIds: string[]) => {
  userIds.forEach(prefetchUser)
}
