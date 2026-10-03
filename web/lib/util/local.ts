export interface Store {
  getItem: (key: string) => string | null
  setItem: (key: string, val: string) => void
  removeItem: (key: string) => void
  clear: () => void
}

// About 1 MiB in UTF-16. Large/pinned payloads remain available in memory and
// are fetched again on reload instead of monopolizing the site's storage.
const MAX_NOTIFICATION_CACHE_LENGTH = 512 * 1024
const isNotificationCache = (key: string) =>
  key.startsWith('notifications-') && key !== 'notifications-seen-time'

const isQuotaError = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  'name' in error &&
  (error.name === 'QuotaExceededError' ||
    error.name === 'NS_ERROR_DOM_QUOTA_REACHED')

function getStorageProxy(store: Storage): Store {
  // Pending values (including removal tombstones) override stale disk values.
  const pending = new Map<string, string | null>()
  const warned = new Set<string>()
  let cleared = false
  const warn = (key: string, error: unknown) => {
    if (warned.has(key)) return
    warned.add(key)
    console.warn(error)
  }

  const removeItem = (key: string) => {
    pending.set(key, null)
    try {
      store.removeItem(key)
      pending.delete(key)
    } catch (error) {
      warn(key, error)
    }
  }

  const evictNotificationCaches = () => {
    try {
      // Snapshot keys before removing entries, which changes their indices.
      const keys = Array.from({ length: store.length }, (_, i) => store.key(i))
      for (const key of keys) {
        if (!key || !isNotificationCache(key)) continue
        if (!cleared && !pending.has(key)) pending.set(key, store.getItem(key))
        store.removeItem(key)
        // Old versions persisted this separately. It is no longer consulted.
        store.removeItem(
          key.replace('notifications-', 'latest-notification-time-')
        )
      }
    } catch (error) {
      warn('notification-cache-eviction', error)
    }
  }

  return {
    getItem: (key) => {
      if (pending.has(key)) return pending.get(key) ?? null
      if (cleared) return null
      try {
        return store.getItem(key) ?? null
      } catch (error) {
        warn(key, error)
        return null
      }
    },
    setItem: (key, value) => {
      // JSON.stringify(undefined) can reach this helper from state updaters.
      // Match Web Storage's string conversion before inspecting the payload.
      value = String(value)
      if (
        isNotificationCache(key) &&
        value.length > MAX_NOTIFICATION_CACHE_LENGTH
      ) {
        removeItem(key)
        pending.set(key, value)
        return
      }
      try {
        store.setItem(key, value)
      } catch (error) {
        // Only server-backed notification caches may be reclaimed. Drafts,
        // preferences, credentials, and native flags are never quota victims.
        if (isQuotaError(error)) {
          evictNotificationCaches()
          try {
            store.setItem(key, value)
            if (cleared) pending.set(key, value)
            else pending.delete(key)
            return
          } catch (retryError) {
            warn(key, retryError)
          }
        } else warn(key, error)
        pending.set(key, value)
        return
      }
      if (cleared) pending.set(key, value)
      else pending.delete(key)
    },
    removeItem,
    clear: () => {
      pending.clear()
      // If clearing fails, don't expose the previous account's values again.
      cleared = true
      try {
        store.clear()
        cleared = false
      } catch (error) {
        warn('clear', error)
      }
    },
  }
}

export let safeLocalStorage: Store | undefined
export let safeSessionStorage: Store | undefined

try {
  safeLocalStorage = getStorageProxy(localStorage)
} catch {
  if (typeof window !== 'undefined') safeLocalStorage = newInMemoryStore()
}

try {
  safeSessionStorage = getStorageProxy(sessionStorage)
} catch {
  if (typeof window !== 'undefined') safeSessionStorage = newInMemoryStore()
}

export function newInMemoryStore(): Store {
  const store = new Map<string, string>()
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, String(value))
    },
    removeItem: (key) => {
      store.delete(key)
    },
    clear: () => store.clear(),
  }
}
