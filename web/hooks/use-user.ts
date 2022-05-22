import { useEffect, useState } from 'react'
import { PrivateUser } from 'common/user'
import {
  listenForLogin,
  listenForPrivateUser,
  listenForUser,
  User,
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
