import { useEffect, useState } from 'react'

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState<boolean>()
  useEffect(() => {
    // matches tailwind sm breakpoint
    const onResize = () => setIsMobile(window.innerWidth < 640)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return isMobile
}
