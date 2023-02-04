function getStorageProxy(store: Storage) {
  try {
    store.getItem('test')
  } catch (e) {
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

export const safeLocalStorage =
  typeof localStorage !== 'undefined'
    ? getStorageProxy(localStorage)
    : undefined

export const safeSessionStorage =
  typeof sessionStorage !== 'undefined'
    ? getStorageProxy(sessionStorage)
    : undefined
