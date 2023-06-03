import { useEffect } from 'react'
import { ContractComment, PostComment } from 'common/comment'
import { listenForCommentsOnContract } from 'web/lib/firebase/comments'
import { usePersistentState, inMemoryStore } from './use-persistent-state'
import { useRealtimeRows } from 'web/lib/supabase/realtime/use-realtime'

export const useComments = (contractId: string) => {
  const [comments, setComments] = usePersistentState<
    ContractComment[] | undefined
  >(undefined, {
    key: 'comments-' + contractId,
    store: inMemoryStore(),
  })

  useEffect(() => {
    if (contractId) return listenForCommentsOnContract(contractId, setComments)
  }, [contractId])

  return comments
}

export const useNewCommentsOnPost = (postId: string) => {
  return useRealtimeRows('post_comments', { k: 'post_id', v: postId }).map(
    (c) =>
      ({
        ...(c.data as any),
        id: c.comment_id,
        createdTime: c.created_time && Date.parse(c.created_time),
      } as PostComment)
  )
}
