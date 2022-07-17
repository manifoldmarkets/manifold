import { useEffect } from 'react'
import { updateUser } from 'web/lib/firebase/users'

export const usePing = (userId: string | undefined) => {
  useEffect(() => {
    if (!userId) return

    const pingInterval = setInterval(() => {
      updateUser(userId, {
        lastPingTime: Date.now(),
      })
    }, 1000 * 30)

    return () => clearInterval(pingInterval)
  }, [userId])
}
