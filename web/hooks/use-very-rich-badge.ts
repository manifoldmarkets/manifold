import { useEffect, useState } from 'react'
import { api } from 'web/lib/api/api'

const STORAGE_KEY = 'very-rich-badge-cache'
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

function getCachedAmount(userId: string): number | null {
  if (typeof window === 'undefined') return null
  try {
    const cached = localStorage.getItem(`${STORAGE_KEY}-${userId}`)
    if (!cached) return null
    const { amount, timestamp } = JSON.parse(cached)
    if (Date.now() - timestamp > CACHE_DURATION) return null
    return amount
  } catch {
    return null
  }
}

function setCachedAmount(userId: string, amount: number) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(
      `${STORAGE_KEY}-${userId}`,
      JSON.stringify({ amount, timestamp: Date.now() })
    )
  } catch {
    // Ignore storage errors
  }
}

export function clearVeryRichBadgeCache(userId: string) {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(`${STORAGE_KEY}-${userId}`)
  } catch {
    // Ignore storage errors
  }
}

export function useVeryRichBadge(userId?: string) {
  const [amount, setAmount] = useState<number>(() => {
    if (!userId) return 0
    return getCachedAmount(userId) ?? 0
  })

  useEffect(() => {
    let cancelled = false
    if (!userId) {
      setAmount(0)
      return () => {
        cancelled = true
      }
    }

    // Try cache first
    const cached = getCachedAmount(userId)
    if (cached !== null) {
      setAmount(cached)
    }

    // Always fetch fresh data
    api('get-very-rich-badge', { userId })
      .then((res) => {
        if (!cancelled) {
          setAmount(res.amountSpentMana)
          setCachedAmount(userId, res.amountSpentMana)
        }
      })
      .catch((error) => {
        console.error('Failed to fetch very rich badge:', error)
        if (!cancelled && cached === null) setAmount(0)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  return amount
}
