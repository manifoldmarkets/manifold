import { PrivateUser, User } from 'common/user'
import { useEffect, useState } from 'react'
import { getTopUserCreators } from 'web/lib/supabase/users'
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
