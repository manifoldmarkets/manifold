import { useEffect, useState } from 'react'
import { api } from 'web/lib/api/api'

export type UserEntitlement = {
  entitlementId: string
  grantedTime: string
  expiresTime?: string | null
  metadata?: Record<string, any>
}

export function useUserEntitlements(userId?: string) {
  const [ents, setEnts] = useState<UserEntitlement[] | undefined>(undefined)
  useEffect(() => {
    let cancelled = false
    if (!userId) {
      setEnts(undefined)
      return () => {
        cancelled = true
      }
    }
    api('get-user-entitlements', { userId })
      .then((res) => {
        if (!cancelled) setEnts(res.entitlements)
      })
      .catch((error) => {
        console.error('Failed to fetch user entitlements:', error)
        if (!cancelled) setEnts([])
      })
    return () => {
      cancelled = true
    }
  }, [userId])
  return ents
}
