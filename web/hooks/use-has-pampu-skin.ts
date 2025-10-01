import { useEffect, useState } from 'react'
import { useUserEntitlements } from './use-user-entitlements'

const STORAGE_KEY = 'has-pampu-skin-cache'
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

function getCachedPampuSkin(userId: string): boolean | null {
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

function setCachedPampuSkin(userId: string, hasSkin: boolean) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(
      `${STORAGE_KEY}-${userId}`,
      JSON.stringify({ data: hasSkin, timestamp: Date.now() })
    )
  } catch {
    // Ignore storage errors
  }
}

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
  const [hasSkin, setHasSkin] = useState<boolean>(() => {
    if (!userId) return false
    const cached = getCachedPampuSkin(userId)
    return cached ?? false
  })

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
    setCachedPampuSkin(userId, isEquipped)
  }, [userId, entitlements])

  return hasSkin
}
