import { useEffect, useState } from 'react'
import { listenForFollowers, listenForFollows } from 'web/lib/firebase/users'
import { safeLocalStorage } from 'web/lib/util/local'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { db } from 'web/lib/supabase/db'

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
export const useFollowedIdsSupabase = (userId: string | undefined) => {
  const [followedIds, setFollowedIds] = usePersistentLocalState<
    string[] | undefined
  >(undefined, `user-followed-${userId}`)
  useEffect(() => {
    db.from('user_follows')
      .select('follow_id')
      .eq('user_id', userId)
      .then((res) => {
        setFollowedIds(res.data?.map((r) => r.follow_id))
      })
  }, [userId])
  return followedIds
}
