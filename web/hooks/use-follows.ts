import { useEffect, useState } from 'react'
import { listenForFollowers, listenForFollows } from 'web/lib/firebase/users'
import { contracts, listenForContractFollows } from 'web/lib/firebase/contracts'

export const useFollows = (userId: string | null | undefined) => {
  const [followIds, setFollowIds] = useState<string[] | undefined>()

  useEffect(() => {
    if (userId) {
      const key = `follows:${userId}`
      const follows = localStorage.getItem(key)
      if (follows) setFollowIds(JSON.parse(follows))

      return listenForFollows(userId, (follows) => {
        setFollowIds(follows)
        localStorage.setItem(key, JSON.stringify(follows))
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

export const useContractFollows = (contractId: string) => {
  const [followIds, setFollowIds] = useState<string[] | undefined>()

  useEffect(() => {
    return listenForContractFollows(contractId, setFollowIds)
  }, [contractId])

  return followIds
}
