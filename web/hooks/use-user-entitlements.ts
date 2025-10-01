import { useEffect, useState } from 'react'
import { api } from 'web/lib/api/api'

export type UserEntitlement = {
  entitlementId: string
  grantedTime: string
  expiresTime?: string | null
  metadata?: Record<string, any>
}

const STORAGE_KEY = 'user-entitlements-cache'
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

function getCachedEntitlements(userId: string): UserEntitlement[] | null {
  if (typeof window === 'undefined') return null
  try {
    const cached = localStorage.getItem(`${STORAGE_KEY}-${userId}`)
    if (!cached) return null
    const { data, timestamp } = JSON.parse(cached)
    if (Date.now() - timestamp > CACHE_DURATION) return null
    return data
  } catch {
    return null
  }
}

function setCachedEntitlements(userId: string, data: UserEntitlement[]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(
      `${STORAGE_KEY}-${userId}`,
      JSON.stringify({ data, timestamp: Date.now() })
    )
  } catch {
    // Ignore storage errors
  }
}

export function clearEntitlementsCache(userId: string) {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(`${STORAGE_KEY}-${userId}`)
  } catch {
    // Ignore storage errors
  }
}

export function useUserEntitlements(userId?: string) {
  const [ents, setEnts] = useState<UserEntitlement[] | undefined>(() => {
    if (!userId) return undefined
    return getCachedEntitlements(userId) ?? undefined
  })

  useEffect(() => {
    let cancelled = false
    if (!userId) {
      setEnts(undefined)
      return () => {
        cancelled = true
      }
    }

    // Try cache first
    const cached = getCachedEntitlements(userId)
    if (cached) {
      setEnts(cached)
    }

    // Always fetch fresh data
    api('get-user-entitlements', { userId })
      .then((res) => {
        if (!cancelled) {
          setEnts(res.entitlements)
          setCachedEntitlements(userId, res.entitlements)
        }
      })
      .catch((error) => {
        console.error('Failed to fetch user entitlements:', error)
        if (!cancelled && !cached) setEnts([])
      })
    return () => {
      cancelled = true
    }
  }, [userId])
  return ents
}
