import { useEffect } from 'react'
import { safeLocalStorage } from 'web/lib/util/local'
import { storageStore, usePersistentState } from './use-persistent-state'

// 640 matches tailwind sm breakpoint
export function useIsMobile(threshold = 640) {
  const [isMobile, setIsMobile] = usePersistentState(false, {
    key: 'is-mobile',
    // Save in localstorage because isMobile status doesn't change much.
    store: storageStore(safeLocalStorage),
  })
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < threshold)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [threshold, setIsMobile])
  return isMobile
}
