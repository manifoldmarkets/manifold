import { useEffect } from 'react'
import { api } from 'web/lib/api/api'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'

export type UserEntitlement = {
  entitlementId: string
  grantedTime: string
  expiresTime?: string | null
  metadata?: Record<string, any>
}

const STORAGE_KEY = 'user-entitlements-cache'

export function clearEntitlementsCache(userId: string) {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(`${STORAGE_KEY}-${userId}`)
  } catch {
    // Ignore storage errors
  }
}

export function useUserEntitlements(userId?: string) {
  const key = `${STORAGE_KEY}-${userId ?? 'anon'}`
  const [ents, setEnts, ready] = usePersistentLocalState<
    UserEntitlement[] | undefined | { data?: unknown }
  >(undefined, key)

  useEffect(() => {
    let cancelled = false
    if (!userId) {
      setEnts(undefined)
      return () => {
        cancelled = true
      }
    }

    // Migrate older cached shape { data, timestamp } -> array
    if (ready && ents && !Array.isArray(ents)) {
      const maybeArr = (ents as any)?.data
      if (Array.isArray(maybeArr)) setEnts(maybeArr)
      else setEnts(undefined)
    }

    // Always fetch fresh data
    api('get-user-entitlements', { userId })
      .then((res) => {
        if (!cancelled) {
          setEnts(res.entitlements)
        }
      })
      .catch((error) => {
        console.error('Failed to fetch user entitlements:', error)
        if (!cancelled && (ents == null || !Array.isArray(ents))) setEnts([])
      })
    return () => {
      cancelled = true
    }
  }, [userId, ready])
  return Array.isArray(ents) ? ents : undefined
}
