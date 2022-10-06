import { useEffect, useState } from 'react'

export function useIsMobile(threshold?: number) {
  const [isMobile, setIsMobile] = useState<boolean>()
  useEffect(() => {
    // 640 matches tailwind sm breakpoint
    const onResize = () => setIsMobile(window.innerWidth < (threshold ?? 640))
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [threshold])
  return isMobile
}
