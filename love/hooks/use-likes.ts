import { useEffect } from 'react'
import { db } from 'web/lib/supabase/db'
import { run } from 'common/supabase/utils'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'

const getLikesGivenByUser = async (creatorId: string) => {
  const { data } = await run(
    db.from('love_likes').select('target_id').eq('creator_id', creatorId)
  )
  return data ? data.map((like) => like.target_id) : []
}

const getLikesReceivedByUser = async (targetId: string) => {
  const { data } = await run(
    db.from('love_likes').select('creator_id').eq('target_id', targetId)
  )
  return data ? data.map((like) => like.creator_id) : []
}

export const useLikesGivenByUser = (creatorId: string | undefined) => {
  const [likesGiven, setLikesGiven] = usePersistentInMemoryState<
    string[] | undefined
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
    string[] | undefined
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
