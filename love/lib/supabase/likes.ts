import { db } from 'web/lib/supabase/db'
import { run } from 'common/supabase/utils'

export type LikeData = {
  userId: string
  createdTime: number
}

export const getLikesGivenByUser = async (creatorId: string) => {
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

export const getLikesReceivedByUser = async (targetId: string) => {
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
