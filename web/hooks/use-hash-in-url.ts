'use client'
import { useEffect, useState } from 'react'
import { useIsClient } from 'web/hooks/use-is-client'

const getHash = () =>
  typeof window !== 'undefined'
    ? decodeURIComponent(window.location.hash.replace('#', ''))
    : undefined

export const useHashInUrl = () => {
  const [hash, setHash] = useState(getHash())
  const isClient = useIsClient()

  useEffect(() => {
    const handleHashChange = () => {
      setHash(getHash())
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => {
      window.removeEventListener('hashchange', handleHashChange)
    }
  }, [isClient])

  return isClient ? hash : undefined
}
