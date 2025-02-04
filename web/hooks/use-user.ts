'use client'
import {
  useWebsocketPrivateUser as useWebsocketPrivateUserCommon,
  useWebsocketUser as useWebsocketUserCommon,
} from 'client-common/hooks/use-websocket-user'
import { PrivateUser } from 'common/user'
import { useContext, useEffect, useState } from 'react'
import { AuthContext } from 'web/components/auth-context'
import { api } from 'web/lib/api/api'
import { getShouldBlockDestiny } from 'web/lib/supabase/groups'
import { getPrivateUserSafe } from 'web/lib/supabase/users'
import { useIsPageVisible } from './use-page-visible'
import { db } from 'common/supabase/db'

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

export const useWebsocketUser = (userId: string | undefined) => {
  const isPageVisible = useIsPageVisible()
  return useWebsocketUserCommon(userId, isPageVisible, () =>
    api('user/by-id/:id', { id: userId ?? '_' })
  )
}

export const useWebsocketPrivateUser = (userId: string | undefined) => {
  const isPageVisible = useIsPageVisible()
  return useWebsocketPrivateUserCommon(
    userId,
    isPageVisible,
    getPrivateUserSafe
  )
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
