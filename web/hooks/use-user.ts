'use client'
import { PrivateUser, User } from 'common/user'
import { useContext, useEffect, useState } from 'react'
import { AuthContext } from 'web/components/auth-context'
import { db } from 'web/lib/supabase/db'
import { getShouldBlockDestiny } from 'web/lib/supabase/groups'
import { useLiveUpdates } from './use-persistent-supabase-polling'
import { run } from 'common/supabase/utils'
import { useApiSubscription } from './use-api-subscription'
import { getFullUserById, getPrivateUserSafe } from 'web/lib/supabase/users'

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
  const [user, setUser] = useState<User | null | undefined>()

  useApiSubscription({
    topics: [`user/${userId ?? '_'}`],
    onBroadcast: ({ data }) => {
      console.log(data)
      setUser((user) => {
        if (!user) {
          return user
        } else {
          return {
            ...user,
            ...(data.user as Partial<User>),
          }
        }
      })
    },
  })

  useEffect(() => {
    if (userId) {
      getFullUserById(userId).then((result) => {
        setUser(result)
      })
    } else {
      setUser(null)
    }
  }, [userId])

  return user
}

export const usePollUserBalances = (userIds: string[]) => {
  return useLiveUpdates(async () => {
    const { data } = await run(
      db.from('users').select('id, balance').in('id', userIds)
    )
    return data
  })
}

export const useWebsocketPrivateUser = (userId: string | undefined) => {
  const [privateUser, setPrivateUser] = useState<
    PrivateUser | null | undefined
  >()

  useApiSubscription({
    topics: [`private-user/${userId ?? '_'}`],
    onBroadcast: () => {
      getPrivateUserSafe().then((result) => {
        if (result) {
          setPrivateUser(result)
        }
      })
    },
  })

  useEffect(() => {
    if (userId) {
      getPrivateUserSafe().then((result) => setPrivateUser(result))
    } else {
      setPrivateUser(null)
    }
  }, [userId])
  return privateUser
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
