import { useEffect, useState } from 'react'
import { listenForLogin, User } from '../lib/firebase/users'

export const useUser = () => {
  const [user, setUser] = useState<User | null>(null)
  useEffect(() => listenForLogin(setUser), [])
  return user
}
