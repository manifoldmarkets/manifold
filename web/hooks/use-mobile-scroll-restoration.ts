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
    // Only run on iOS mobile (Android uses native scroll)
    if (!isMobile) return

    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream
    if (!isIOS) return

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

      // Prevent Next.js from scrolling window during restoration
      const preventNextJsScroll = () => {
        if (window.scrollY !== 0) {
          window.scrollTo(0, 0)
        }
      }

      window.addEventListener('scroll', preventNextJsScroll)

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
            // Stop preventing window scroll after a short delay
            setTimeout(() => {
              window.removeEventListener('scroll', preventNextJsScroll)
              isRestoringRef.current = false
            }, 100)
          })
        } else if (retries < maxRetries) {
          // Container not ready yet, retry very quickly
          setTimeout(() => attemptScrollRestore(retries + 1, maxRetries), 5)
        } else {
          // Give up after max retries
          window.removeEventListener('scroll', preventNextJsScroll)
          isRestoringRef.current = false
        }
      }

      // Try to restore immediately (synchronously)
      attemptScrollRestore()
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

    return () => {
      if (scrollContainer) {
        scrollContainer.removeEventListener('scroll', debouncedSaveScroll)
      }
      debouncedSaveScroll.cancel()
      router.events.off('routeChangeStart', handleRouteChangeStart)
      router.events.off('routeChangeComplete', handleRouteChangeComplete)
    }
  }, [router.events, router.asPath, isMobile])
}
