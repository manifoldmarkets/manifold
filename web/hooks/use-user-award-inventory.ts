import { useEffect, useState, useCallback } from 'react'
import { api } from 'web/lib/api/api'

const STORAGE_KEY = 'award-inventory-cache'
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

type AwardInventory = {
  plus: number
  premium: number
  crystal: number
}

function getCachedInventory(): AwardInventory | null {
  if (typeof window === 'undefined') return null
  try {
    const cached = localStorage.getItem(STORAGE_KEY)
    if (!cached) return null
    const { data, timestamp } = JSON.parse(cached)
    if (Date.now() - timestamp > CACHE_DURATION) return null
    return data
  } catch {
    return null
  }
}

function setCachedInventory(data: AwardInventory) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ data, timestamp: Date.now() })
    )
  } catch {
    // Ignore storage errors
  }
}

export function clearAwardInventoryCache() {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore storage errors
  }
}

export function useUserAwardInventory() {
  const [inventory, setInventory] = useState<AwardInventory | null>(() => {
    return getCachedInventory()
  })
  const [loading, setLoading] = useState(true)

  const fetchInventory = useCallback(() => {
    setLoading(true)
    api('get-user-award-inventory', {})
      .then((res) => {
        setInventory(res)
        setCachedInventory(res)
        setLoading(false)
      })
      .catch(() => {
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    // If we have cache, use it immediately
    const cached = getCachedInventory()
    if (cached) {
      setInventory(cached)
      setLoading(false)
    }
    // Always fetch fresh data in the background
    fetchInventory()
  }, [fetchInventory])

  return { inventory, loading, refresh: fetchInventory }
}
