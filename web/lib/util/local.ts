export interface Store {
  getItem: (key: string) => string | null
  setItem: (key: string, val: string) => void
  removeItem: (key: string) => void
  clear: () => void
}

// Only warn once per key, per store. setItem runs inside a React setState
// updater (see usePersistentLocalState), which re-runs on re-render and twice
// under StrictMode, so warning per call floods the console.
function warnOnce(warned: Set<string>, key: string, e: unknown) {
  if (warned.has(key)) return
  warned.add(key)
  console.warn(`Browser storage unavailable for "${key}".`, e)
}

function getStorageProxy(store: Storage): Store {
  // Storage can be full or unavailable, and can become so after initialization,
  // so every operation is best effort and never throws.
  //
  // A value that won't persist is kept in memory rather than dropped: reads
  // still see the last write for the rest of the session, so callers don't
  // diverge from what they think they stored. Note we deliberately do NOT
  // evict on failure — clearing the store takes unrelated data with it, and
  // dropping the key's existing value would be real data loss for the keys
  // that aren't caches. Keeping persisted values bounded is the writer's job.
  const memory = newInMemoryStore()
  const warned = new Set<string>()

  return {
    getItem: (key: string) => {
      // A memory entry only exists when the last write to that key failed, in
      // which case the store still holds the superseded value.
      const pending = memory.getItem(key)
      if (pending !== null) return pending
      try {
        return store.getItem(key) ?? null
      } catch (e) {
        warnOnce(warned, key, e)
        return null
      }
    },
    setItem: (key: string, value: string) => {
      try {
        store.setItem(key, value)
        memory.removeItem(key)
      } catch (e) {
        warnOnce(warned, key, e)
        memory.setItem(key, value)
      }
    },
    removeItem: (key: string) => {
      memory.removeItem(key)
      try {
        store.removeItem(key)
      } catch (e) {
        warnOnce(warned, key, e)
      }
    },
    clear: () => {
      memory.clear()
      try {
        store.clear()
      } catch (e) {
        warnOnce(warned, '*', e)
      }
    },
  }
}

export let safeLocalStorage: Store | undefined
export let safeSessionStorage: Store | undefined

try {
  safeLocalStorage = getStorageProxy(localStorage)
} catch {}

try {
  safeSessionStorage = getStorageProxy(sessionStorage)
} catch {}

export function newInMemoryStore(): Store {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
  }
}
