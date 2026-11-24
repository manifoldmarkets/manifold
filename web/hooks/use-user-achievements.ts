import { useCallback, useEffect, useSyncExternalStore } from 'react'

import { APIResponse } from 'common/api/schema'
import { api } from 'web/lib/api/api'

export type UserAchievements = APIResponse<'get-user-achievements'>

// One user's stats, shared by navigation and the profile.
//
// - On mount and focus, reuse the last read within the caller's freshness window.
// - A failed read keeps the last good stats and reports the error.
// - Profiles nobody is showing are kept for a quick return, up to MAX_IDLE.

const FRESH_MS = 30_000
const MAX_IDLE = 20

type Entry = {
  data?: UserAchievements
  error?: Error
  loadedAt?: number
  loading?: Promise<void>
  lastUsed: number
}

const entries = new Map<string, Entry>()
const listeners = new Map<string, Set<() => void>>()

const getEntry = (userId: string): Entry =>
  entries.get(userId) ?? { lastUsed: Date.now() }

const setEntry = (userId: string, patch: Partial<Entry>) => {
  entries.set(userId, { ...getEntry(userId), ...patch })
  listeners.get(userId)?.forEach((listener) => listener())
}

function loadUserAchievements(userId: string) {
  const entry = getEntry(userId)
  if (entry.loading) return entry.loading
  const loading = api('get-user-achievements', { userId })
    .then((data) => {
      setEntry(userId, { data, loadedAt: Date.now(), error: undefined })
    })
    .catch((e) => {
      setEntry(userId, { error: e instanceof Error ? e : new Error(String(e)) })
    })
    .finally(() => {
      if (getEntry(userId).loading === loading) {
        setEntry(userId, { loading: undefined })
      }
      pruneIdle()
    })
  setEntry(userId, { loading })
  return loading
}

// Forget the least recently shown profiles beyond MAX_IDLE.
const pruneIdle = () => {
  const idle = [...entries.entries()]
    .filter(([id, e]) => !listeners.has(id) && !e.loading)
    .sort(([, a], [, b]) => a.lastUsed - b.lastUsed)
  for (const [id] of idle.slice(0, Math.max(0, idle.length - MAX_IDLE))) {
    entries.delete(id)
  }
}

export function useUserAchievements(
  userId: string | undefined,
  freshMs = FRESH_MS
) {
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!userId) return () => {}
      let set = listeners.get(userId)
      if (!set) {
        set = new Set()
        listeners.set(userId, set)
      }
      set.add(listener)
      return () => {
        const current = listeners.get(userId)
        current?.delete(listener)
        if (current && current.size === 0) {
          listeners.delete(userId)
          const entry = entries.get(userId)
          if (entry) entries.set(userId, { ...entry, lastUsed: Date.now() })
          pruneIdle()
        }
      }
    },
    [userId]
  )
  const getSnapshot = useCallback(
    () => (userId ? entries.get(userId) : undefined),
    [userId]
  )
  const entry = useSyncExternalStore(subscribe, getSnapshot, () => undefined)

  useEffect(() => {
    if (!userId) return
    const loadIfStale = () => {
      const { loadedAt } = getEntry(userId)
      if (loadedAt === undefined || Date.now() - loadedAt >= freshMs) {
        loadUserAchievements(userId)
      }
    }
    loadIfStale()
    const onFocus = () => {
      if (document.visibilityState === 'visible') loadIfStale()
    }
    document.addEventListener('visibilitychange', onFocus)
    window.addEventListener('focus', onFocus)
    return () => {
      document.removeEventListener('visibilitychange', onFocus)
      window.removeEventListener('focus', onFocus)
    }
  }, [userId, freshMs])

  const retry = useCallback(() => {
    if (userId) loadUserAchievements(userId)
  }, [userId])

  return {
    achievements: entry?.data,
    error: entry?.error,
    loading: !!entry?.loading,
    retry,
  }
}
