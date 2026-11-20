import { useEffect, useRef } from 'react'
import { useApiSubscription } from './use-api-subscription'
import { User } from 'common/user'
import { useState } from 'react'
import { FullUser } from 'common/api/user-types'
import { PrivateUser } from 'common/user'
import { SUPPORTER_ENTITLEMENT_IDS } from 'common/supporter-config'

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

const entitlementRefreshes = new Map<
  string,
  { generation: number; promise: Promise<FullUser> }
>()

// Mutation replies and broadcasts can arrive out of order. Treat them as
// invalidations, and only apply a fresh read after the last observed change.
// Full-user loads must use this same coordinator: they carry entitlements too.
// Coalesce overlapping requests, but repeat a read invalidated while in flight.
export const refreshUserEntitlements = (
  userId: string,
  getFullUserById: (id: string) => Promise<FullUser>
) => {
  const pending = entitlementRefreshes.get(userId)
  if (pending) {
    pending.generation++
    return pending.promise
  }
  const refresh: { generation: number; promise: Promise<FullUser> } = {
    generation: 0,
    // Defer the first read until the coordinator is registered, so every
    // caller joins the same promise, including initial/full-user loads.
    promise: Promise.resolve()
      .then(async () => {
        while (true) {
          const generation = refresh.generation
          const user = await getFullUserById(userId)
          if (generation !== refresh.generation) continue
          entitlementRefreshes.delete(userId)
          applyLocalUserUpdate({ id: userId, entitlements: user.entitlements })
          return user
        }
      })
      .finally(() => {
        if (entitlementRefreshes.get(userId) === refresh)
          entitlementRefreshes.delete(userId)
      }),
  }
  entitlementRefreshes.set(userId, refresh)
  return refresh.promise
}

export const useWebsocketUser = (
  userId: string | undefined,
  isPageVisible: boolean,
  getFullUserById: (id: string) => Promise<FullUser>,
  pollMembership = false
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
      const { entitlements, ...update } = data.user as UserUpdate
      recordChange(update)
      applyUpdate(update)
      if (entitlements !== undefined) {
        refreshUserEntitlements(update.id, getFullUserById).catch(console.error)
      }
    },
  })

  const latestFetch = useRef(0)
  const refreshUser = async (id: string) => {
    const fetchId = ++latestFetch.current
    // Tracked until the result is set, so a change landing just as the fetch
    // settles isn't missed.
    const changes = trackUserChanges(id)
    try {
      const result = await refreshUserEntitlements(id, getFullUserById)
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

    let disposed = false
    let retry: ReturnType<typeof setTimeout> | undefined
    const refresh = () => {
      if (!userId) return
      refreshUser(userId).catch((error) => {
        console.error(error)
        // Recover initial loads even before we know whether to poll a member.
        if (!disposed) retry = setTimeout(refresh, 60_000)
      })
    }
    if (userId) {
      refresh()
    } else {
      setUser(null)
    }
    return () => {
      disposed = true
      clearTimeout(retry)
      latestFetch.current++
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

  const hasMembership = user?.entitlements?.some(
    (entitlement) =>
      SUPPORTER_ENTITLEMENT_IDS.some(
        (id) => id === entitlement.entitlementId
      ) &&
      (entitlement.autoRenew ||
        entitlement.expiresTime === undefined ||
        entitlement.expiresTime > Date.now())
  )
  useEffect(() => {
    if (!pollMembership || !isPageVisible || !userId || !hasMembership) return
    // Scheduler changes may not reach the API websocket process. Reconcile
    // visible members once a minute; hidden tabs refresh on becoming visible.
    const interval = setInterval(() => {
      refreshUserEntitlements(userId, getFullUserById).catch(console.error)
    }, 60_000)
    return () => clearInterval(interval)
  }, [pollMembership, isPageVisible, userId, hasMembership])

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
