import { useEffect, useState } from 'react'
import {
  getUserFollows,
  getUserFollowers,
  getUserIsFollowing,
} from 'web/lib/supabase/follows'
import { useSubscription } from 'web/lib/supabase/realtime/use-subscription'

export const useFollows = (userId: string | null | undefined) => {
  const { rows } = useSubscription(
    'user_follows',
    { k: 'user_id', v: userId ?? '_' },
    () => getUserFollows(userId ?? '_')
  )

  if (!userId) return undefined
  return rows?.map((r) => r.follow_id)
}

export const useFollowers = (userId: string | undefined) => {
  const { rows } = useSubscription(
    'user_follows',
    { k: 'follow_id', v: userId ?? '_' },
    () => getUserFollowers(userId ?? '_')
  )

  if (!userId) return undefined
  return rows?.map((r) => r.user_id)
}

export const useIsFollowing = (
  userId: string | undefined,
  followId: string
) => {
  const [isFollowing, setIsFollowing] = useState<boolean>(false)
  useEffect(() => {
    if (userId) getUserIsFollowing(userId, followId).then(setIsFollowing)
  }, [userId, followId])
  return { isFollowing, setIsFollowing }
}
