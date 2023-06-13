import { User } from 'common/user'
import { useEffect, useRef, useState } from 'react'
import { getUser, getUsers } from 'web/lib/supabase/user'
import { useEffectCheckEquality } from './use-effect-check-equality'
import { Answer, DpmAnswer } from 'common/answer'

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

export function useUserByIdOrAnswer(answer: Answer | DpmAnswer) {
  const userId = answer.userId
  const user = useUserById(userId)
  if ('name' in answer)
    return {
      id: userId,
      name: answer.name,
      username: answer.username,
      avatarUrl: answer.avatarUrl,
    }
  if (!user) return user
  return {
    id: userId,
    name: user.name,
    username: user.username,
    avatarUrl: user.avatarUrl,
  }
}
