export const safeLocalStorage = () =>
  isLocalStorage() ? localStorage : undefined
export const safeSessionStorage = () =>
  isSessionStorage() ? sessionStorage : undefined

const isLocalStorage = () => {
  try {
    localStorage.getItem('test')
    localStorage.setItem('hi', 'mom')
    return true
  } catch (e) {
    return false
  }
}

const isSessionStorage = () => {
  try {
    sessionStorage.getItem('test')
    sessionStorage.setItem('hi', 'mom')
    return true
  } catch (e) {
    return false
  }
}
