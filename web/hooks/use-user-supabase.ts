import { User } from 'common/user'
import { useEffect, useRef, useState } from 'react'
import { getUser, getUsers } from 'web/lib/supabase/user'
import { useEffectCheckEquality } from './use-effect-check-equality'
import { Answer, DpmAnswer } from 'common/answer'
import { uniqBy } from 'lodash'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'

export function useUserById(userId: string | undefined) {
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
export function useUsersInStore(
  userIds: string[],
  key: string,
  limit?: number
) {
  const [users, setUsers] = usePersistentLocalState<User[] | undefined>(
    undefined,
    'use-users-in-local-storage' + key
  )

  useEffectCheckEquality(() => {
    const userIdsToFetch = userIds.filter(
      (id) => !users?.map((u) => u.id).includes(id)
    )
    if (userIdsToFetch.length === 0) return
    getUsers(limit ? userIdsToFetch.slice(0, limit) : userIdsToFetch).then(
      (newUsers) => {
        setUsers((currentUsers) =>
          uniqBy((currentUsers ?? []).concat(newUsers), 'id')
        )
      }
    )
  }, [userIds])

  return users?.filter((user) => userIds.includes(user.id))
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
