import { useCallback, useEffect, useSyncExternalStore } from 'react'

import { APIResponse } from 'common/api/schema'
import { api } from 'web/lib/api/api'

export type UserAchievements = APIResponse<'get-user-achievements'>

// One user's profile stats, shared by every component showing them (the
// Trophies tab and the profile showcase), so they always agree.
//
// - Read again on each visit to the profile, and when the page regains focus,
//   once the last read is FRESH_MS old: a trophy reached while away shows up.
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
    })
  setEntry(userId, { loading })
  return loading
}

const loadIfStale = (userId: string) => {
  const { loadedAt } = getEntry(userId)
  if (loadedAt === undefined || Date.now() - loadedAt >= FRESH_MS) {
    loadUserAchievements(userId)
  }
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

export function useUserAchievements(userId: string) {
  const subscribe = useCallback(
    (listener: () => void) => {
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
  const getSnapshot = useCallback(() => entries.get(userId), [userId])
  const entry = useSyncExternalStore(subscribe, getSnapshot, () => undefined)

  useEffect(() => {
    loadIfStale(userId)
    const onFocus = () => {
      if (document.visibilityState === 'visible') loadIfStale(userId)
    }
    document.addEventListener('visibilitychange', onFocus)
    window.addEventListener('focus', onFocus)
    return () => {
      document.removeEventListener('visibilitychange', onFocus)
      window.removeEventListener('focus', onFocus)
    }
  }, [userId])

  const retry = useCallback(() => {
    loadUserAchievements(userId)
  }, [userId])

  return {
    achievements: entry?.data,
    error: entry?.error,
    loading: !!entry?.loading,
    retry,
  }
}
