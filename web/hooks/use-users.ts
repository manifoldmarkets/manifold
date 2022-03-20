import { useState, useEffect } from 'react'
import { PrivateUser, User } from '../../common/user'
import {
  getUser,
  listenForAllUsers,
  listenForPrivateUsers,
} from '../lib/firebase/users'

export const useUsers = () => {
  const [users, setUsers] = useState<User[]>([])

  useEffect(() => {
    listenForAllUsers(setUsers)
  }, [])

  return users
}

export const useUserById = (userId: string) => {
  const [user, setUser] = useState<User | undefined>(undefined)

  useEffect(() => {
    getUser(userId).then(setUser)
  }, [userId])

  return user
}

export const usePrivateUsers = () => {
  const [users, setUsers] = useState<PrivateUser[]>([])

  useEffect(() => {
    listenForPrivateUsers(setUsers)
  }, [])

  return users
}
