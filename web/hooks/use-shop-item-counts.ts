import { useEffect, useState } from 'react'
import { api } from 'web/lib/api/api'

export function useShopItemCounts() {
  const [counts, setCounts] = useState<{ [itemId: string]: number }>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Don't make API calls if no items have global limits
    const hasGlobalLimits = Object.keys({}).length > 0 // Will be populated once backend is running

    api('get-shop-item-counts', {})
      .then((res) => {
        setCounts(res.counts || {})
        setLoading(false)
      })
      .catch((error) => {
        console.error('Failed to fetch shop item counts:', error)
        // Fail gracefully - just don't show counts
        setCounts({})
        setLoading(false)
      })
  }, [])

  return { counts, loading }
}
