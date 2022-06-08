import { useEffect, useState } from 'react'
import { listenForFollowers, listenForFollows } from 'web/lib/firebase/users'

export const useFollows = (userId: string | undefined) => {
  const [followIds, setFollowIds] = useState<string[] | undefined>()

  useEffect(() => {
    if (userId) return listenForFollows(userId, setFollowIds)
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
