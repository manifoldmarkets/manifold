import { useEffect, useState } from 'react'
import { listenForFollowers, listenForFollows } from 'web/lib/firebase/users'
import { safeLocalStorage } from 'web/lib/util/local'

export const useFollows = (userId: string | null | undefined) => {
  const [followIds, setFollowIds] = useState<string[] | undefined>()

  useEffect(() => {
    if (userId) {
      const key = `follows:${userId}`
      const follows = safeLocalStorage?.getItem(key)
      if (follows) setFollowIds(JSON.parse(follows))

      return listenForFollows(userId, (follows) => {
        setFollowIds(follows)
        safeLocalStorage?.setItem(key, JSON.stringify(follows))
      })
    }
  }, [userId])

  return followIds
}

export const useFollowers = (userId: string | undefined) => {
  const [followerIds, setFollowerIds] = useState<string[] | undefined>()

  useEffect(() => {
    if (userId) return listenForFollowers(userId, setFollowerIds)
  }, [userId])

  return followerIds
}
