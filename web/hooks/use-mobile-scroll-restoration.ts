import { debounce } from 'lodash'
import { useRouter } from 'next/router'
import { useEffect, useRef } from 'react'
import { useIsMobile } from './use-is-mobile'

/**
 * Handles scroll restoration for the page-scroll-container on mobile.
 * When body is fixed and scrolling happens in a container, we need to
 * manually save and restore scroll positions per route.
 */
export function useMobileScrollRestoration() {
  const router = useRouter()
  const scrollPositions = useRef<Record<string, number>>({})
  const isRestoringRef = useRef(false)
  const isMobile = useIsMobile()

  useEffect(() => {
    // Only run on mobile
    if (!isMobile) return

    // Continuously save scroll position as user scrolls
    const saveScrollPosition = () => {
      const scrollContainer = document.querySelector(
        '.page-scroll-container'
      ) as HTMLElement
      if (scrollContainer && !isRestoringRef.current) {
        scrollPositions.current[router.asPath] = scrollContainer.scrollTop
      }
    }

    const debouncedSaveScroll = debounce(saveScrollPosition, 100)

    const handleRouteChangeStart = () => {
      // Save current scroll position one last time before navigating
      saveScrollPosition()
    }

    const handleRouteChangeComplete = (url: string) => {
      // Restore scroll position for the new route
      isRestoringRef.current = true

      const savedPosition = scrollPositions.current[url]

      // Wait for the scroll container to be ready with retry mechanism
      const attemptScrollRestore = (retries = 0, maxRetries = 20) => {
        const scrollContainer = document.querySelector(
          '.page-scroll-container'
        ) as HTMLElement

        if (scrollContainer) {
          // Restore immediately, then use RAF to ensure it sticks
          scrollContainer.scrollTop = savedPosition || 0

          requestAnimationFrame(() => {
            scrollContainer.scrollTop = savedPosition || 0
            isRestoringRef.current = false
          })
        } else if (retries < maxRetries) {
          // Container not ready yet, retry very quickly
          setTimeout(() => attemptScrollRestore(retries + 1, maxRetries), 5)
        } else {
          // Give up after max retries
          isRestoringRef.current = false
        }
      }

      // Try to restore immediately (synchronously)
      attemptScrollRestore()
    }

    // Prevent Next.js scroll restoration from interfering
    // Keep window scroll at 0 since body is fixed on mobile
    const preventWindowScroll = () => {
      if (window.scrollY !== 0) {
        window.scrollTo(0, 0)
      }
    }

    // Listen to scroll events on the container
    const scrollContainer = document.querySelector(
      '.page-scroll-container'
    ) as HTMLElement

    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', debouncedSaveScroll, {
        passive: true,
      })
    }

    router.events.on('routeChangeStart', handleRouteChangeStart)
    router.events.on('routeChangeComplete', handleRouteChangeComplete)
    window.addEventListener('scroll', preventWindowScroll)

    return () => {
      if (scrollContainer) {
        scrollContainer.removeEventListener('scroll', debouncedSaveScroll)
      }
      debouncedSaveScroll.cancel()
      router.events.off('routeChangeStart', handleRouteChangeStart)
      router.events.off('routeChangeComplete', handleRouteChangeComplete)
      window.removeEventListener('scroll', preventWindowScroll)
    }
  }, [router.events, router.asPath, isMobile])
}
