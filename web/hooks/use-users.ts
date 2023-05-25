import { User } from 'common/user'
import { debounce } from 'lodash'
import { useEffect, useState } from 'react'
import {
  UserSearchResult,
  getTopUserCreators,
  searchUsers,
} from 'web/lib/supabase/users'

export const useDiscoverUsers = (
  userId: string | null | undefined,
  excludedUserIds: string[],
  limit: number
) => {
  const [discoverUserIds, setDiscoverUserIds] = useState<string[] | undefined>()

  useEffect(() => {
    if (userId)
      getTopUserCreators(userId, excludedUserIds, limit).then((rows) => {
        setDiscoverUserIds(rows.map((r) => r.user_id))
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
