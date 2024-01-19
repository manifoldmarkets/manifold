import { useEffect } from 'react'
import { db } from 'web/lib/supabase/db'
import { run } from 'common/supabase/utils'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'

export type LikeData = {
  userId: string
  createdTime: number
}

const getLikesGivenByUser = async (creatorId: string) => {
  const { data } = await run(
    db
      .from('love_likes')
      .select('target_id, created_time')
      .eq('creator_id', creatorId)
  )
  return data
    ? data.map(
        (like) =>
          ({
            userId: like.target_id,
            createdTime: new Date(like.created_time).getTime(),
          } as LikeData)
      )
    : []
}

const getLikesReceivedByUser = async (targetId: string) => {
  const { data } = await run(
    db
      .from('love_likes')
      .select('creator_id, created_time')
      .eq('target_id', targetId)
  )
  return data
    ? data.map((like) => ({
        userId: like.creator_id,
        createdTime: new Date(like.created_time).getTime(),
      }))
    : []
}

export const useLikesGivenByUser = (creatorId: string | undefined) => {
  const [likesGiven, setLikesGiven] = usePersistentInMemoryState<
    LikeData[] | undefined
  >(undefined, `likes-given-by-${creatorId}`)

  const refresh = () => {
    if (creatorId === undefined) return
    getLikesGivenByUser(creatorId).then(setLikesGiven)
  }

  useEffect(() => {
    refresh()
  }, [creatorId])

  return { likesGiven, refreshLikesGiven: refresh }
}

export const useLikesReceivedByUser = (targetId: string | undefined) => {
  const [likesReceived, setLikesReceived] = usePersistentInMemoryState<
    LikeData[] | undefined
  >(undefined, `likes-received-by-${targetId}`)

  const refresh = () => {
    if (targetId === undefined) return
    getLikesReceivedByUser(targetId).then(setLikesReceived)
  }

  useEffect(() => {
    refresh()
  }, [targetId])

  return { likesReceived, refreshLikesReceived: refresh }
}
