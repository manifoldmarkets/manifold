import { useEffect, useState } from 'react'
import { getCachedUser, listenForLogin, listenForUser, User } from '../lib/firebase/users'

export const useUser = () => {
  const [user, setUser] = useState<User | null | undefined>(getCachedUser())
  useEffect(() => listenForLogin(setUser), [])

  const userId = user?.id

  useEffect(() => {
    if (userId) return listenForUser(userId, setUser)
  }, [userId])

  return user
}
