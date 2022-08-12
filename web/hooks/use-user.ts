import { useContext } from 'react'
import { useFirestoreDocumentData } from '@react-query-firebase/firestore'
import { QueryClient } from 'react-query'

import { doc, DocumentData } from 'firebase/firestore'
import { getUser, User, users } from 'web/lib/firebase/users'
import { AuthContext } from 'web/components/auth-context'

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

const queryClient = new QueryClient()

export const prefetchUser = (userId: string) => {
  queryClient.prefetchQuery(['users', userId], () => getUser(userId))
}

export const prefetchUsers = (userIds: string[]) => {
  userIds.forEach(prefetchUser)
}
