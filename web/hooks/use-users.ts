import { useState, useEffect } from 'react'
import { listenForAllUsers, User } from '../lib/firebase/users'

export const useUsers = () => {
  const [users, setUsers] = useState<User[]>([])

  useEffect(() => {
    listenForAllUsers(setUsers)
  }, [])

  return users
}
