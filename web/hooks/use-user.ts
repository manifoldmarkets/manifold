'use client'
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

export type DisplayUser = {
  id: string
  name: string
  username: string
  avatarUrl?: string
  createdTime?: number
  isBannedFromPosting?: boolean
}

const cache: {
  [userId: string]: DisplayUser | 'loading' | 'not-found' | null
} = {}

export const cacheDisplayUser = (user: DisplayUser) => {
  cache[user.id] = user
}

export const cacheDisplayUsers = (users: DisplayUser[]) => {
  users.forEach((user) => {
    cache[user.id] = user
  })
}

export const useDisplayUser = (userId: string) => {
  useEffect(() => {
    fetchAndCacheUsers([userId])
    return () => {
      if (cache[userId] === 'loading') {
        delete cache[userId]
      }
    }
  }, [userId])

  return cache[userId] ?? 'loading'
}

export const useDisplayUsers = (userIds: string[]) => {
  useEffect(() => {
    fetchAndCacheUsers(userIds)
    return () => {
      userIds.forEach((id) => {
        if (cache[id] === 'loading') {
          delete cache[id]
        }
      })
    }
  }, [userIds])

  return userIds.map((id) => cache[id] ?? 'loading')
}

export const fetchAndCacheUsers = async (userIds: string[]) => {
  const missingUserIds = userIds.filter((userId) => cache[userId] == undefined)
  if (missingUserIds.length == 0) {
    return
  }
  missingUserIds.forEach((id) => {
    cache[id] = 'loading'
  })

  const { error, data } = await fetchUsers(missingUserIds)
  if (error) {
    console.error('Error fetching users', error)
    missingUserIds.forEach((id) => {
      cache[id] = null
    })
  } else {
    data.forEach((user) => {
      cache[user.id] = {
        ...user,
        isBannedFromPosting: user.isBannedFromPosting === 'true',
      }
    })
    missingUserIds
      .filter((id) => cache[id] === 'loading')
      .forEach((id) => {
        cache[id] = 'not-found'
      })
  }
}

// safe to use in static props
export const fetchUsers = async (userIds: string[]) => {
  const q = db
    .from('users')
    .select('id, name, username, data->>avatarUrl, data->>isBannedFromPosting')

  if (userIds.length === 1) {
    q.eq('id', userIds[0])
  } else {
    q.in('id', userIds)
  }

  return q
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
