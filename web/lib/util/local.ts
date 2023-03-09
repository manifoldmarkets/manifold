function getStorageProxy(store: Storage) {
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
      } catch (e) {
        store.clear()
        // try again
        store.setItem(key, value)
      }
    },
    removeItem: (key: string) => store.removeItem(key) as void,
  }
}

export let safeLocalStorage: ReturnType<typeof getStorageProxy> | undefined
export let safeSessionStorage: ReturnType<typeof getStorageProxy> | undefined

try {
  safeLocalStorage = getStorageProxy(localStorage)
} catch {}

try {
  safeSessionStorage = getStorageProxy(sessionStorage)
} catch {}
