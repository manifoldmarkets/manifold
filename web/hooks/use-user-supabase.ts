import { User } from 'common/user'
import { useEffect, useRef, useState } from 'react'
import { getUser, getUsers } from 'web/lib/supabase/user'
import { useEffectCheckEquality } from './use-effect-check-equality'

export function useUserById(userId: string) {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  useEffect(() => {
    if (userId) {
      getUser(userId).then((result) => {
        setUser(result)
      })
    }
  }, [userId])
  return user
}

export function useUsers(userIds: string[]) {
  const [users, setUsers] = useState<User[] | undefined>(undefined)

  const requestIdRef = useRef(0)
  useEffectCheckEquality(() => {
    const requestId = ++requestIdRef.current

    getUsers(userIds).then((users) => {
      if (requestId !== requestIdRef.current) return
      setUsers(users)
    })
  }, [userIds])

  return users
}
