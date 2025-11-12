import { useEffect } from 'react'
import { useIsMobile } from './use-is-mobile'

export function useIOSBodyFix() {
  const isMobile = useIsMobile()
  useEffect(() => {
    // Only apply on mobile devices (max-width: 1024px matches the CSS breakpoint)
    if (!isMobile) return
    // Detect iOS devices
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream

    if (isIOS) {
      // On iOS, set position fixed to prevent the bottom bar from becoming unstuck
      document.body.style.position = 'fixed'
      document.body.style.width = '100%'
      document.body.style.height = '100%'
      document.body.style.top = '0'
      document.body.style.left = '0'
    }

    // Handle window resize to restore normal behavior on desktop
    const handleResize = () => {
      const isMobileNow = window.innerWidth < 640
      if (!isMobileNow) {
        // Restore desktop scrolling
        document.body.style.position = ''
        document.body.style.width = ''
        document.body.style.height = ''
        document.body.style.top = ''
        document.body.style.left = ''
        document.body.style.overflow = ''
        document.documentElement.style.height = ''
        document.documentElement.style.overflow = ''
      }
    }

    window.addEventListener('resize', handleResize)

    // Cleanup function to restore original styles
    return () => {
      document.body.style.position = ''
      document.body.style.width = ''
      document.body.style.height = ''
      document.body.style.top = ''
      document.body.style.left = ''
      document.body.style.overflow = ''
      document.documentElement.style.height = ''
      document.documentElement.style.overflow = ''
      window.removeEventListener('resize', handleResize)
    }
  }, [])
}
