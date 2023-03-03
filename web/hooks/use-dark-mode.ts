import { useEffect } from 'react'
import { useIsClient } from './use-is-client'

export const useDarkMode = () => {
  const isClient = useIsClient()
  useEffect(() => {
    if (!isClient) return
    if (
      localStorage.theme === 'dark' ||
      (!('theme' in localStorage) &&
        window.matchMedia('(prefers-color-scheme: dark)').matches)
    ) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }, [isClient])
}
