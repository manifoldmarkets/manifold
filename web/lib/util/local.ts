export interface Store {
  getItem: (key: string) => string | null
  setItem: (key: string, val: string) => void
  removeItem: (key: string) => void
}

function getStorageProxy(store: Storage): Store {
  // Storage can become full or unavailable after initialization. Treat every
  // operation as best effort, so persistence failures don't crash the UI.
  return {
    getItem: (key: string) => {
      try {
        return store.getItem(key) ?? null
      } catch (e) {
        console.warn(e)
        return null
      }
    },
    setItem: (key: string, value: string) => {
      try {
        store.setItem(key, value)
      } catch (e) {
        // Keep the caller's in-memory state and leave other stored data intact.
        console.warn(e)
      }
    },
    removeItem: (key: string) => {
      try {
        store.removeItem(key)
      } catch (e) {
        console.warn(e)
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
  const store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key],
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
  }
}
