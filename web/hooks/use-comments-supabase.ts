import { Comment, ContractComment } from 'common/comment'
import { Json } from 'common/supabase/schema'
import { useEffect, useState } from 'react'
import {
  getAllComments,
  getComments,
  getNumUserComments,
} from 'web/lib/supabase/comments'
import { db } from 'web/lib/supabase/db'
import { uniqBy } from 'lodash'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'

export function useComments(contractId: string, limit: number) {
  const [comments, setComments] = useState<Json[]>([])

  useEffect(() => {
    if (contractId) {
      getAllComments(contractId, limit).then((result) => setComments(result))
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

  return comments.filter((c) => c.hidden != true)
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

export function useRealtimeComments(limit: number) {
  const [comments, setComments] = useState<Comment[]>([])

  useEffect(() => {
    getComments(limit)
      .then((result) => setComments(result))
      .catch((e) => console.log(e))
  }, [])

  useEffect(() => {
    const channel = db.channel('live-comments')
    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'contract_comments',
      },
      (payload) => {
        if (payload) {
          const payloadComment = payload.new.data as Comment
          setComments((comments) => {
            if (
              payloadComment &&
              !comments.some((c) => c.id == payloadComment.id)
            ) {
              return [payloadComment].concat(comments.slice(0, -1))
            } else {
              return comments
            }
          })
        }
      }
    )
    channel.subscribe(async (status) => {})
    return () => {
      db.removeChannel(channel)
    }
  }, [db])

  return comments
}
