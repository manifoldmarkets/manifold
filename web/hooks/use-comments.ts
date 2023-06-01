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
export const useCommentsOnPost = (postId: string | undefined) => {
  return useRealtimeRows('post_comments')
    .filter((c) => c.post_id === postId)
    .map((c) => c.data as PostComment)
}
