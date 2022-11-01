import { useEffect, useState } from 'react'

// 640 matches tailwind sm breakpoint
export function useIsMobile(threshold = 640) {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < threshold)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [threshold])
  return isMobile
}
