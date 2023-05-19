import { User } from 'common/user'
import { debounce, groupBy, sortBy } from 'lodash'
import { useEffect, useState } from 'react'
import { getUserBetContracts } from 'web/lib/firebase/contracts'
import { UserSearchResult, searchUsers } from 'web/lib/supabase/users'

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
