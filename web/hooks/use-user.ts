import { useEffect, useState } from 'react'
import { PrivateUser } from '../../common/user'
import {
  listenForLogin,
  listenForPrivateUser,
  listenForUser,
  User,
} from '../lib/firebase/users'

export const useUser = () => {
  const [user, setUser] = useState<User | null | undefined>(undefined)

  useEffect(() => listenForLogin(setUser), [])

  const userId = user?.id

  useEffect(() => {
    if (userId) return listenForUser(userId, setUser)
  }, [userId])

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
