import { useEffect, useRef, useState } from 'react'
import { useEffectCheckEquality } from './use-effect-check-equality'
import { Answer, DpmAnswer } from 'common/answer'
import { uniqBy, uniq } from 'lodash'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { filterDefined } from 'common/util/array'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'
import {
  DisplayUser,
  getDisplayUsers,
  getFullUserById,
  getUserById,
} from 'web/lib/supabase/users'
import { FullUser } from 'common/api/user-types'

export function useUserById(userId: string | undefined) {
  const [user, setUser] = usePersistentInMemoryState<
    FullUser | null | undefined
  >(undefined, `user-${userId}`)
  useEffect(() => {
    if (userId) {
      getFullUserById(userId).then((result) => {
        setUser(result)
      })
    }
  }, [userId])
  return user
}

export function useDisplayUserById(userId: string | undefined) {
  const [user, setUser] = usePersistentInMemoryState<
    DisplayUser | null | undefined
  >(undefined, `user-${userId}`)

  useEffect(() => {
    if (userId) {
      getUserById(userId).then((result) => {
        setUser(result)
      })
    }
  }, [userId])
  return user
}

export function useUsers(userIds: string[]) {
  const [users, setUsers] = useState<(DisplayUser | null)[] | undefined>(
    undefined
  )

  const requestIdRef = useRef(0)
  useEffectCheckEquality(() => {
    const requestId = ++requestIdRef.current

    getDisplayUsers(userIds).then((users) => {
      if (requestId !== requestIdRef.current) return
      setUsers(userIds.map((id) => users.find((u) => u?.id === id) ?? null))
    })
  }, [userIds])

  return users
}

export function useUsersInStore(
  userIds: string[],
  key: string,
  limit?: number
) {
  const [users, setUsers] = usePersistentLocalState<DisplayUser[] | undefined>(
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
    getDisplayUsers(userIdsToFetch).then((newUsers) => {
      setUsers((currentUsers) =>
        uniqBy(filterDefined(newUsers).concat(currentUsers ?? []), 'id')
      )
      setUserIdsFetched((currentIds) => uniq(currentIds.concat(userIdsToFetch)))
    })
  }, [userIdsToFetch])

  return users?.filter((user) => userIds.includes(user?.id))
}

export function useDisplayUserByIdOrAnswer(answer: Answer | DpmAnswer) {
  const userId = answer.userId
  const user = useDisplayUserById(userId)
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
