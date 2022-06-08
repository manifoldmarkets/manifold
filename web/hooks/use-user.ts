import { useEffect, useState } from 'react'
import { useFirestoreDocumentData } from '@react-query-firebase/firestore'
import { QueryClient } from 'react-query'

import { DocumentData } from 'firebase/firestore'
import { PrivateUser } from 'common/user'
import {
  getUser,
  listenForLogin,
  listenForPrivateUser,
  listenForUser,
  User,
  userDocRef,
} from 'web/lib/firebase/users'
import { useStateCheckEquality } from './use-state-check-equality'

export const useUser = () => {
  const [user, setUser] = useStateCheckEquality<User | null | undefined>(
    undefined
  )

  useEffect(() => listenForLogin(setUser), [setUser])

  const userId = user?.id

  useEffect(() => {
    if (userId) return listenForUser(userId, setUser)
  }, [userId, setUser])

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

export const useUserById = (userId: string) => {
  const result = useFirestoreDocumentData<DocumentData, User>(
    ['users', userId],
    userDocRef(userId),
    { subscribe: true, includeMetadataChanges: true }
  )

  return result.isLoading ? undefined : result.data
}

const queryClient = new QueryClient()

export const prefetchUser = (userId: string) => {
  queryClient.prefetchQuery(['users', userId], () => getUser(userId))
}

export const prefetchUsers = (userIds: string[]) => {
  userIds.forEach(prefetchUser)
}
