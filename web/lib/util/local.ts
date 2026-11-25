export interface Store {
  getItem: (key: string) => string | null
  setItem: (key: string, val: string) => void
  removeItem: (key: string) => void
}

function getStorageProxy(store: Storage): Store | undefined {
  try {
    store.setItem('test', '')
    store.getItem('test')
    store.removeItem('test')
  } catch (e) {
    console.warn(e)
    return undefined
  }
  return {
    getItem: (key: string) => store.getItem(key) ?? null,
    setItem: (key: string, value: string) => {
      try {
        store.setItem(key, value)
      } catch {
        // Probably over quota: make room and try once more. Saving is
        // best-effort, so never throw. Callers often save from inside a React
        // state update, where a throw takes down the whole page.
        try {
          store.clear()
          store.setItem(key, value)
        } catch (e) {
          console.warn(`Could not save ${key} to storage`, e)
        }
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
