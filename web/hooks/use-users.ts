import { PrivateUser, User } from 'common/user'
import { debounce } from 'lodash'
import { useEffect, useState } from 'react'
import {
  UserSearchResult,
  getTopUserCreators,
  searchUsers,
} from 'web/lib/supabase/users'
import { getRecentlyActiveUsers } from 'web/lib/supabase/user'
import { getPrivateUser } from 'web/lib/firebase/users'

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

export const useRecentlyActiveUsersAndPrivateUsers = (limit: number) => {
  const [usersAndPrivates, setUsersAndPrivates] = useState<
    {
      user: User
      privateUser: PrivateUser | undefined
    }[]
  >()
  const loadUsers = async () => {
    const users = await getRecentlyActiveUsers(limit)
    const privateUsers = await Promise.all(
      users.map(async (u) => getPrivateUser(u.id))
    )
    const usersAndPrivates = users.map((user) => ({
      user,
      privateUser: privateUsers.find((p) => p?.id === user.id),
    }))
    setUsersAndPrivates(usersAndPrivates)
  }
  useEffect(() => {
    loadUsers()
  }, [limit])

  return usersAndPrivates
}
