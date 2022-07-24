import { useContext, useEffect, useState } from 'react'
import { useFirestoreDocumentData } from '@react-query-firebase/firestore'
import { QueryClient } from 'react-query'

import { doc, DocumentData } from 'firebase/firestore'
import { PrivateUser } from 'common/user'
import {
  getUser,
  listenForPrivateUser,
  User,
  users,
} from 'web/lib/firebase/users'
import { AuthContext } from 'web/components/auth-context'

export const useUser = () => {
  return useContext(AuthContext)
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
