import { useEffect } from 'react'
import { api } from 'web/lib/api/api'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'

const STORAGE_KEY = 'very-rich-badge-cache'

export function clearVeryRichBadgeCache(userId: string) {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(`${STORAGE_KEY}-${userId}`)
  } catch {
    // Ignore storage errors
  }
}

export function useVeryRichBadge(userId?: string) {
  const key = `${STORAGE_KEY}-${userId ?? 'anon'}`
  const [amount, setAmount] = usePersistentLocalState<number>(0, key)

  useEffect(() => {
    let cancelled = false
    if (!userId) {
      setAmount(0)
      return () => {
        cancelled = true
      }
    }

    // Always fetch fresh data; persist locally
    api('get-very-rich-badge', { userId })
      .then((res) => {
        if (!cancelled) {
          setAmount(res.amountSpentMana)
        }
      })
      .catch((error) => {
        console.error('Failed to fetch very rich badge:', error)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  return amount
}
