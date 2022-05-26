export const safeLocalStorage = () => (isLocalStorage() ? localStorage : null)

const isLocalStorage = () => {
  try {
    localStorage.getItem('test')
    localStorage.setItem('hi', 'mom')
    return true
  } catch (e) {
    return false
  }
}
