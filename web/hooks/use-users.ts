import { useState, useEffect } from 'react'
import { PrivateUser, User } from 'common/user'
import { debounce, groupBy, sortBy } from 'lodash'
import { useFirestoreQueryData } from '@react-query-firebase/firestore'
import { DocumentData } from 'firebase/firestore'
import { users, privateUsers } from 'web/lib/firebase/users'
import { searchUsers, UserSearchResult } from 'web/lib/supabase/users'
import { getUserBetContracts } from 'web/lib/supabase/contracts'

export const useUsers = () => {
  const result = useFirestoreQueryData<DocumentData, User[]>(['users'], users, {
    subscribe: true,
    includeMetadataChanges: true,
  })
  return result.data ?? []
}

export const usePrivateUsers = () => {
  const result = useFirestoreQueryData<DocumentData, PrivateUser[]>(
    ['private users'],
    privateUsers,
    { subscribe: true, includeMetadataChanges: true }
  )
  return result.data || []
}

export const useDiscoverUsers = (userId: string | null | undefined) => {
  const [discoverUserIds, setDiscoverUserIds] = useState<string[] | undefined>()

  useEffect(() => {
    if (userId)
      getUserBetContracts(userId).then((contracts) => {
        const creatorCounts = Object.entries(
          groupBy(contracts, 'creatorId')
        ).map(([id, contracts]) => [id, contracts.length] as const)

        const topCreatorIds = sortBy(creatorCounts, ([_, i]) => i)
          .map(([id]) => id)
          .reverse()

        setDiscoverUserIds(topCreatorIds)
      })
  }, [userId])

  return discoverUserIds
}

export const useUsersSupabase = (
  query: string,
  limit: number,
  extraUserFields?: (keyof User)[]
) => {
  const [users, setUsers] = useState<UserSearchResult[] | undefined>(undefined)

  const debouncedSearchUsers = debounce((query, limit) => {
    searchUsers(query, limit, extraUserFields).then(setUsers)
  }, 200)
  useEffect(() => {
    debouncedSearchUsers(query, limit)
    return () => debouncedSearchUsers.cancel()
  }, [query, limit])

  return users
}
