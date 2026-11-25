export interface Store {
  getItem: (key: string) => string | null
  setItem: (key: string, val: string) => void
  removeItem: (key: string) => void
}

function getStorageProxy(store: Storage): Store | undefined {
  try {
    // Check reads only. A test write fails whenever storage is full, which
    // would leave the site unable to read it too, or to shrink what filled it.
    store.getItem('test')
  } catch (e) {
    console.warn(e)
    return undefined
  }
  return {
    getItem: (key: string) => store.getItem(key) ?? null,
    setItem: (key: string, value: string) => {
      try {
        store.setItem(key, value)
      } catch (e) {
        // Usually over quota. Saving is best-effort, so skip it. Don't throw:
        // callers often save from inside a React state update, where a throw
        // takes down the whole page. And don't make room by clearing storage:
        // that wipes drafts, settings, and the native app and experiment flags
        // kept here.
        console.warn(`Could not save ${key} to storage`, e)
      }
    },
    removeItem: (key: string) => store.removeItem(key),
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
