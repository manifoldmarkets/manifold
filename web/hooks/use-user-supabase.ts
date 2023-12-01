import { User } from 'common/user'
import { useEffect, useRef, useState } from 'react'
import { getUser, getUsers } from 'web/lib/supabase/user'
import { useEffectCheckEquality } from './use-effect-check-equality'
import { Answer, DpmAnswer } from 'common/answer'
import { uniqBy, uniq } from 'lodash'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { filterDefined } from 'common/util/array'

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
  const [users, setUsers] = useState<(User | null)[] | undefined>(undefined)

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

  // Fetch all users at least once on load.
  const [userIdsFetched, setUserIdsFetched] = useState<string[]>([])
  const fetchedSet = new Set(userIdsFetched)
  const userIdsNotFetched = userIds.filter((id) => !fetchedSet.has(id))
  const userIdsToFetch = limit
    ? userIdsNotFetched.slice(0, limit)
    : userIdsNotFetched

  useEffectCheckEquality(() => {
    if (userIdsToFetch.length === 0) return
    getUsers(userIdsToFetch).then((newUsers) => {
      setUsers((currentUsers) =>
        uniqBy(filterDefined(newUsers).concat(currentUsers ?? []), 'id')
      )
      setUserIdsFetched((currentIds) => uniq(currentIds.concat(userIdsToFetch)))
    })
  }, [userIdsToFetch])

  return users?.filter((user) => userIds.includes(user?.id))
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
