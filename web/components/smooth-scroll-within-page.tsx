import React, { FC, useEffect } from 'react'
import { useRouter } from 'next/router'

export const SmoothScrollWithinPage: FC = ({ children }) => {
  const router = useRouter()

  useEffect(() => {
    const html = document.documentElement
    let scrollTimeout: NodeJS.Timeout

    const debouncedRemoveSmoothScroll = () => {
      clearTimeout(scrollTimeout)
      scrollTimeout = setTimeout(() => {
        html.style.removeProperty('scroll-behavior')
      }, 100)
    }

    const handleHashChangeStart = () => {
      html.style.setProperty('scroll-behavior', 'smooth', 'important')
      debouncedRemoveSmoothScroll()
    }

    const handleRouteChangeStart = () => {
      html.style.removeProperty('scroll-behavior')
    }

    const handleScroll = () => {
      debouncedRemoveSmoothScroll()
    }

    router.events.on('hashChangeStart', handleHashChangeStart)
    router.events.on('routeChangeStart', handleRouteChangeStart)

    window.addEventListener('scroll', handleScroll, {
      passive: true,
    })

    return () => {
      clearTimeout(scrollTimeout)
      router.events.off('hashChangeStart', handleHashChangeStart)
      router.events.off('routeChangeStart', handleRouteChangeStart)
      window.removeEventListener('scroll', handleScroll)
      html.style.removeProperty('scroll-behavior')
    }
  }, [])

  return <>{children}</>
}
