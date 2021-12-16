import { useEffect, useState } from 'react'
import { listenForLogin, listenForUser, User } from '../lib/firebase/users'

export const useUser = () => {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  useEffect(() => listenForLogin(setUser), [])

  const userId = user?.id

  useEffect(() => {
    if (userId) return listenForUser(userId, setUser)
  }, [userId])

  return user
}
