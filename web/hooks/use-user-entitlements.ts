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
    console.log('Fetching entitlements for userId:', userId)
    api('get-user-entitlements', { userId })
      .then((res) => {
        console.log('Entitlements response:', res)
        console.log(
          'Individual entitlements:',
          res.entitlements.map((e) => e.entitlementId)
        )
        if (!cancelled) {
          console.log(
            'Setting entitlements state for userId:',
            userId,
            res.entitlements
          )
          setEnts(res.entitlements)
          console.log('State set, should trigger re-render')
        }
      })
      .catch((error) => {
        console.error('Entitlements API error:', error)
        if (!cancelled) setEnts([])
      })
    return () => {
      cancelled = true
    }
  }, [userId])
  return ents
}
