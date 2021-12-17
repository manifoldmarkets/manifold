import { useEffect, useLayoutEffect, useState } from 'react'
import { listenForLogin, listenForUser, User } from '../lib/firebase/users'

export const useUser = () => {
  const [user, setUser] = useState<User | null | undefined>(undefined)

  // Use layout effect to trigger re-render before first paint.
  useLayoutEffect(() => listenForLogin(setUser), [])

  const userId = user?.id

  useEffect(() => {
    if (userId) return listenForUser(userId, setUser)
  }, [userId])

  return user
}
