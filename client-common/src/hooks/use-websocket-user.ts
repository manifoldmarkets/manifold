import { useEffect, useRef } from 'react'
import { useApiSubscription } from './use-api-subscription'
import { User } from 'common/user'
import { useState } from 'react'
import { FullUser } from 'common/api/user-types'
import { PrivateUser } from 'common/user'

type UserUpdate = Partial<User> & { id: string }

// Changes this client knows it just made, e.g. from a mutation's response.
// They're applied like a broadcast, in case that broadcast is missed: the
// websocket was down, or it arrived before the first fetch returned.
const localUpdateListeners = new Set<(update: UserUpdate) => void>()
export const applyLocalUserUpdate = (update: UserUpdate) => {
  localUpdateListeners.forEach((listener) => listener(update))
}

export const useWebsocketUser = (
  userId: string | undefined,
  isPageVisible: boolean,
  getFullUserById: (id: string) => Promise<FullUser>
) => {
  const [user, setUser] = useState<User | null | undefined>()
  const userRef = useRef(user)
  userRef.current = user

  useApiSubscription({
    topics: [`user/${userId ?? '_'}`],
    onBroadcast: ({ data }) => {
      const { user } = data
      console.log('ws update', user)
      setUser((prevUser) => {
        if (!prevUser) {
          return prevUser
        } else {
          return {
            ...prevUser,
            ...(user as Partial<User>),
          }
        }
      })
    },
  })

  // Only the latest fetch counts, so one started before a change can't
  // overwrite a later one that has it.
  const latestFetch = useRef(0)
  const refreshUser = async (id: string) => {
    const fetchId = ++latestFetch.current
    const result = await getFullUserById(id)
    if (fetchId === latestFetch.current) setUser(result)
  }

  useEffect(() => {
    if (!isPageVisible) return

    if (userId) {
      refreshUser(userId)
    } else {
      setUser(null)
    }
  }, [userId, isPageVisible])

  useEffect(() => {
    if (!userId) return
    const listener = (update: UserUpdate) => {
      if (update.id !== userId) return
      // Before the first fetch returns there's nothing to merge into, and
      // that fetch may predate the change, so fetch again.
      if (userRef.current) {
        setUser((prevUser) => prevUser && { ...prevUser, ...update })
      } else {
        refreshUser(userId)
      }
    }
    localUpdateListeners.add(listener)
    return () => {
      localUpdateListeners.delete(listener)
    }
  }, [userId])

  return user
}

export const useWebsocketPrivateUser = (
  userId: string | undefined,
  isPageVisible: boolean,
  getPrivateUser: () => Promise<PrivateUser | null>
) => {
  const [privateUser, setPrivateUser] = useState<
    PrivateUser | null | undefined
  >()

  useApiSubscription({
    topics: [`private-user/${userId ?? '_'}`],
    onBroadcast: () => {
      getPrivateUser().then((result) => {
        if (result) {
          setPrivateUser(result)
        }
      })
    },
  })

  useEffect(() => {
    if (!isPageVisible) return

    if (userId) {
      getPrivateUser().then((result) => setPrivateUser(result))
    } else {
      setPrivateUser(null)
    }
  }, [userId, isPageVisible])

  return privateUser
}
