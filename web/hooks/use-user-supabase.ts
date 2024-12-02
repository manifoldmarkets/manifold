import { useEffect, useState } from 'react'
import { useEffectCheckEquality } from './use-effect-check-equality'
import { Answer } from 'common/answer'
import { uniqBy, uniq } from 'lodash'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { filterDefined } from 'common/util/array'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'
import {
  DisplayUser,
  getDisplayUsers,
  getFullUserById,
} from 'web/lib/supabase/users'
import { FullUser } from 'common/api/user-types'
import { useBatchedGetter } from './use-batched-getter'

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
  const [user] = useBatchedGetter<DisplayUser | undefined>(
    'user',
    userId ?? '_',
    undefined,
    !!userId
  )
  return user
}

export function useUsers(userIds: string[]) {
  const [users] = useBatchedGetter<(DisplayUser | null)[] | undefined>(
    'users',
    userIds.join(','),
    undefined,
    userIds.length > 0
  )
  return users
}

// TODO: decide whether in-memory or in-localstorage is better and stick to it

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

export function useDisplayUserByIdOrAnswer(answer: Answer) {
  const userId = answer.userId
  return useDisplayUserById(userId)
}
