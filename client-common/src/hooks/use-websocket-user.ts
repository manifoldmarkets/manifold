import { useEffect, useRef } from 'react'
import { useApiSubscription } from './use-api-subscription'
import { User } from 'common/user'
import { useState } from 'react'
import { FullUser } from 'common/api/user-types'
import { PrivateUser } from 'common/user'

type UserUpdate = Partial<User> & { id: string }

// Changes being recorded for requests in flight (see trackUserChanges).
const trackers = new Set<{
  userId: string
  updates: UserUpdate[]
  since: Partial<User>
}>()
const recordChange = (update: UserUpdate) => {
  trackers.forEach((tracker) => {
    if (tracker.userId !== update.id) return
    tracker.updates.push(update)
    tracker.since = { ...tracker.since, ...update }
  })
}

// Records the changes made to a user, by broadcasts and local updates, until
// stop() is called: in order (updates), and merged (since). A fetch made
// meanwhile may have read the user before them, so they should be applied
// again on top of its result.
export const trackUserChanges = (userId: string) => {
  const tracker = {
    userId,
    updates: [] as UserUpdate[],
    since: {} as Partial<User>,
    stop: () => {
      trackers.delete(tracker)
    },
  }
  trackers.add(tracker)
  return tracker
}

// Changes this client knows it just made, e.g. from a mutation's response.
// They're applied like a broadcast, in case that broadcast is missed (e.g. the
// websocket was down).
const localUpdateListeners = new Set<(update: UserUpdate) => void>()
export const applyLocalUserUpdate = (update: UserUpdate) => {
  recordChange(update)
  localUpdateListeners.forEach((listener) => listener(update))
}

export const useWebsocketUser = (
  userId: string | undefined,
  isPageVisible: boolean,
  getFullUserById: (id: string) => Promise<FullUser>
) => {
  const [user, setUser] = useState<User | null | undefined>()

  const applyUpdate = (update: UserUpdate) => {
    setUser((prevUser) =>
      prevUser?.id === update.id ? { ...prevUser, ...update } : prevUser
    )
  }

  useApiSubscription({
    topics: [`user/${userId ?? '_'}`],
    onBroadcast: ({ data }) => {
      const user = data.user as UserUpdate
      console.log('ws update', user)
      recordChange(user)
      applyUpdate(user)
    },
  })

  const latestFetch = useRef(0)
  const refreshUser = async (id: string) => {
    const fetchId = ++latestFetch.current
    // Tracked until the result is set, so a change landing just as the fetch
    // settles isn't missed.
    const changes = trackUserChanges(id)
    try {
      const result = await getFullUserById(id)
      // Only the latest fetch counts, so an earlier one landing late can't
      // overwrite it.
      if (fetchId === latestFetch.current)
        setUser({ ...result, ...changes.since })
    } finally {
      changes.stop()
    }
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
