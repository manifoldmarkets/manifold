import { useEffect, useRef } from 'react'
import { useApiSubscription } from './use-api-subscription'
import { User } from 'common/user'
import { useState } from 'react'
import { FullUser } from 'common/api/user-types'
import { PrivateUser } from 'common/user'

type UserUpdate = Partial<User> & { id: string }
type UserFetch = { userId: string; since: Partial<User> }

// Changes this client knows it just made, e.g. from a mutation's response.
// They're applied like a broadcast, in case that broadcast is missed (e.g. the
// websocket was down).
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

  // The latest fetch, with the changes received since it started. It may have
  // read the user before them, so they're applied again on top of its result.
  const latestFetch = useRef<UserFetch | undefined>(undefined)

  const applyUpdate = (update: UserUpdate) => {
    const pending = latestFetch.current
    if (pending?.userId === update.id)
      pending.since = { ...pending.since, ...update }
    setUser((prevUser) =>
      prevUser?.id === update.id ? { ...prevUser, ...update } : prevUser
    )
  }

  useApiSubscription({
    topics: [`user/${userId ?? '_'}`],
    onBroadcast: ({ data }) => {
      const { user } = data
      console.log('ws update', user)
      applyUpdate(user as UserUpdate)
    },
  })

  const refreshUser = async (id: string) => {
    const thisFetch: UserFetch = { userId: id, since: {} }
    latestFetch.current = thisFetch
    const result = await getFullUserById(id)
    // Only the latest fetch counts, so an earlier one landing late can't
    // overwrite it.
    if (latestFetch.current !== thisFetch) return
    latestFetch.current = undefined
    setUser({ ...result, ...thisFetch.since })
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
      if (update.id === userId) applyUpdate(update)
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
