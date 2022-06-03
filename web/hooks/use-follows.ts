import { useEffect, useState } from 'react'
import { listenForFollows } from 'web/lib/firebase/users'

export const useFollows = (userId: string | undefined) => {
  const [followIds, setFollowIds] = useState<string[] | undefined>()

  useEffect(() => {
    if (userId) return listenForFollows(userId, setFollowIds)
  }, [userId])

  return followIds
}
