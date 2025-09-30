import { useEffect, useState, useCallback } from 'react'
import { api } from 'web/lib/api/api'

export function useUserAwardInventory() {
  const [inventory, setInventory] = useState<{
    plus: number
    premium: number
    crystal: number
  } | null>(null)
  const [loading, setLoading] = useState(true)

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
