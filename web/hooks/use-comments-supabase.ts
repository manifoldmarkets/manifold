import { Comment, ContractComment, PostComment } from 'common/comment'
import { Json } from 'common/supabase/schema'
import { useEffect, useState } from 'react'
import {
  getCommentRows,
  getNumUserComments,
  getPostCommentRows,
} from 'web/lib/supabase/comments'
import { db } from 'web/lib/supabase/db'
import { uniqBy } from 'lodash'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { getAllComments } from 'common/supabase/comments'
import { isBlocked, usePrivateUser } from 'web/hooks/use-user'
import { useSubscription } from 'web/lib/supabase/realtime/use-subscription'

export function useComments(contractId: string, limit: number) {
  const [comments, setComments] = useState<Json[]>([])

  useEffect(() => {
    if (contractId) {
      getAllComments(db, contractId, limit).then((result) =>
        setComments(result)
      )
    }
  }, [contractId])

  return comments
}

export function useUnseenReplyChainCommentsOnContracts(
  contractIds: string[],
  userId: string
) {
  const [comments, setComments] = usePersistentInMemoryState<ContractComment[]>(
    [],
    `recent-feed-replies-${userId}`
  )
  const privateUser = usePrivateUser()

  useEffect(() => {
    if (contractIds.length > 0) {
      db.rpc('get_unseen_reply_chain_comments_matching_contracts', {
        contract_ids: contractIds,
        current_user_id: userId,
      }).then((result) => {
        const { data, error } = result
        if (error || !data) {
          console.log(error)
          return null
        }
        setComments((prev) =>
          uniqBy(
            [
              // TODO: why does typescript think d is an array?
              ...data.map((d: any) => d.data as ContractComment),
              ...prev,
            ],
            (c) => c.id
          )
        )
      })
    }
  }, [JSON.stringify(contractIds)])

  return comments.filter(
    (c) => c.hidden != true && !isBlocked(privateUser, c.userId)
  )
}

export function useNumUserComments(userId: string) {
  const [num, setNum] = useState<number>(0)

  useEffect(() => {
    if (userId) {
      getNumUserComments(userId).then((result) => setNum(result))
    }
  }, [userId])

  return num
}

export function useRealtimeComments(limit: number): Comment[] {
  const { rows } = useSubscription('contract_comments', undefined, () =>
    getCommentRows(limit)
  )
  return (rows ?? []).map((r) => r.data as Comment)
}

export const useRealtimePostComments = (postId: string) => {
  const { rows } = useSubscription(
    'post_comments',
    { k: 'post_id', v: postId },
    () => getPostCommentRows(postId)
  )

  console.log(rows)

  return (rows ?? []).map(
    (c) =>
      ({
        ...(c.data as any),
        id: c.comment_id,
        createdTime: c.created_time && Date.parse(c.created_time),
      } as PostComment)
  )
}
