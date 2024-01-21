import { useEffect } from 'react'

import { ShipData, getShipsForUser } from 'love/lib/supabase/ships'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'

export const useShips = (targetId: string | undefined) => {
  const [ships, setShips] = usePersistentInMemoryState<ShipData[] | undefined>(
    undefined,
    `ships-for-${targetId}`
  )

  const refresh = async () => {
    if (targetId === undefined) return
    try {
      const data = await getShipsForUser(targetId)
      setShips(data)
    } catch (error) {
      console.error('Failed to refresh ships:', error)
      throw error
    }
  }

  useEffect(() => {
    refresh()
  }, [targetId])

  return { ships, refreshShips: refresh }
}
