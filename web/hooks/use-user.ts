import { useEffect, useState } from 'react'
import { useFirestoreDocumentData } from '@react-query-firebase/firestore'
import { DocumentData } from 'firebase/firestore'
import { PrivateUser } from 'common/user'
import {
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
    ['uers', userId],
    userDocRef(userId),
    { subscribe: true, includeMetadataChanges: true }
  )

  return result.isLoading ? undefined : result.data
}
