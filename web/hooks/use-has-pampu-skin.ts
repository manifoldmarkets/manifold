import { useEffect } from 'react'
import { useUserEntitlements } from './use-user-entitlements'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'

const STORAGE_KEY = 'has-pampu-skin-cache'

export function clearPampuSkinCache(userId: string) {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(`${STORAGE_KEY}-${userId}`)
  } catch {
    // Ignore storage errors
  }
}

export function useHasPampuSkin(userId?: string): boolean {
  const entitlements = useUserEntitlements(userId)
  const [hasSkin, setHasSkin] = usePersistentLocalState<boolean>(
    false,
    `${STORAGE_KEY}-${userId ?? 'anon'}`
  )

  useEffect(() => {
    if (!userId || !entitlements) {
      setHasSkin(false)
      return
    }

    // Check if user has pampu-skin entitlement AND it's equipped
    const pampuSkinEnt = entitlements.find(
      (e) => e.entitlementId === 'pampu-skin'
    )
    const isEquipped = pampuSkinEnt?.metadata?.equipped === true
    setHasSkin(isEquipped)
  }, [userId, entitlements])

  return hasSkin
}
