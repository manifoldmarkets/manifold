import { PrivateUser } from 'common/user'
import { useContext, useEffect, useState } from 'react'
import { AuthContext } from 'web/components/auth-context'
import { listenForUser } from 'web/lib/firebase/users'
import { db } from 'web/lib/supabase/db'
import { getShouldBlockDestiny } from 'web/lib/supabase/groups'
import { useStore, useStoreItems } from './use-store'

export const useUser = () => {
  const authUser = useContext(AuthContext)
  return authUser ? authUser.user : authUser
}

export const usePrivateUser = () => {
  const authUser = useContext(AuthContext)
  return authUser ? authUser.privateUser : authUser
}

export const useIsAuthorized = () => {
  const authUser = useContext(AuthContext)
  return authUser?.authLoaded || authUser === null ? !!authUser : undefined
}

export const useUserById = (userId: string | undefined) => {
  return useStore(userId, listenForUser)
}

export const useUsersById = (userIds: string[]) => {
  return useStoreItems(userIds, listenForUser)
}

export const usePrefetchUsers = (userIds: string[]) => {
  useStoreItems(userIds, listenForUser)
}

export const isBlocked = (
  privateUser: PrivateUser | null | undefined,
  otherUserId: string
) => {
  return (
    privateUser?.blockedUserIds.includes(otherUserId) ||
    privateUser?.blockedByUserIds.includes(otherUserId)
  )
}

export const useShouldBlockDestiny = (userId: string | undefined) => {
  const [shouldBlockDestiny, setShouldBlockDestiny] = useState(true)

  useEffect(() => {
    if (userId) {
      getShouldBlockDestiny(userId, db).then((result) =>
        setShouldBlockDestiny(result)
      )
    } else {
      setShouldBlockDestiny(true)
    }
  }, [userId])

  return shouldBlockDestiny
}
