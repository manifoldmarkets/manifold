import { useEffect, useCallback } from 'react'
import { api } from 'web/lib/api/api'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'

const STORAGE_KEY = 'award-inventory-cache'

type AwardInventory = {
  plus: number
  premium: number
  crystal: number
}

function storageKeyFor(userId?: string) {
  return userId ? `${STORAGE_KEY}-${userId}` : STORAGE_KEY
}

export function clearAwardInventoryCache(userId?: string) {
  if (typeof window === 'undefined') return
  try {
    if (userId) {
      localStorage.removeItem(storageKeyFor(userId))
      return
    }
    localStorage.removeItem(STORAGE_KEY)
    const toRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k) continue
      if (k.startsWith(`${STORAGE_KEY}-`)) toRemove.push(k)
    }
    for (const k of toRemove) localStorage.removeItem(k)
  } catch {
    // Ignore storage errors
  }
}

export function useUserAwardInventory(userId?: string) {
  const [inventory, setInventory] =
    usePersistentLocalState<AwardInventory | null>(null, storageKeyFor(userId))
  const [loading, setLoading] = usePersistentLocalState<boolean>(
    true,
    `${storageKeyFor(userId)}-loading`
  )

  const fetchInventory = useCallback(() => {
    setLoading(true)
    api('get-user-award-inventory', {})
      .then((res) => {
        setInventory(res)
        setLoading(false)
      })
      .catch(() => {
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    fetchInventory()
  }, [fetchInventory])

  return { inventory, loading, refresh: fetchInventory }
}
