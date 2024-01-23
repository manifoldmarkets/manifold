import {
  LikeData,
  getLikesGivenByUser,
  getLikesReceivedByUser,
} from 'love/lib/supabase/likes'
import { useEffect } from 'react'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'

export const useLikesGivenByUser = (creatorId: string | undefined) => {
  const [likesGiven, setLikesGiven] = usePersistentInMemoryState<
    LikeData[] | undefined
  >(undefined, `likes-given-by-${creatorId}`)

  const refresh = async () => {
    if (creatorId === undefined) return
    const data = await getLikesGivenByUser(creatorId)
    setLikesGiven(data)
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

  const refresh = async () => {
    if (targetId === undefined) return
    const data = await getLikesReceivedByUser(targetId)
    setLikesReceived(data)
  }

  useEffect(() => {
    refresh()
  }, [targetId])

  return { likesReceived, refreshLikesReceived: refresh }
}
