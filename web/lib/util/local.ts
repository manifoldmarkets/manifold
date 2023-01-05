export const safeLocalStorage = () => {
  const localStorage = ls()

  return {
    getItem: (key: string) => localStorage?.getItem(key),
    setItem: (key: string, value: string) => {
      try {
        localStorage?.setItem(key, value)
      } catch (e) {
        localStorage?.clear()
        // try again
        localStorage?.setItem(key, value)
      }
    },
    removeItem: (key: string) => localStorage?.removeItem(key),
  }
}

export const safeSessionStorage = () => {
  const sessionStorage = ss()

  return {
    getItem: (key: string) => sessionStorage?.getItem(key),
    setItem: (key: string, value: string) => {
      try {
        sessionStorage?.setItem(key, value)
      } catch (e) {
        sessionStorage?.clear()
        // try again
        sessionStorage?.setItem(key, value)
      }
    },
    removeItem: (key: string) => sessionStorage?.removeItem(key),
  }
}

const ls = () => {
  try {
    localStorage.getItem('test')
    return localStorage
  } catch (e) {
    return undefined
  }
}

const ss = () => {
  try {
    sessionStorage.getItem('test')
    return sessionStorage
  } catch (e) {
    return undefined
  }
}
