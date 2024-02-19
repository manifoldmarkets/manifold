import { useEffect } from 'react'
import { debounce } from 'lodash'
import { safeLocalStorage } from 'web/lib/util/local'

export const useSaveScroll = (locationKey: string) => {
  const key = `${locationKey}-scroll`
  useEffect(() => {
    const onScroll = debounce(() => {
      safeLocalStorage?.setItem(key, window.scrollY.toString())
    }, 100)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const scrollY = safeLocalStorage?.getItem(key)
    if (scrollY) {
      window.scrollTo(0, parseInt(scrollY))
    }
  }, [])
}
