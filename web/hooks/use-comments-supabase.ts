import { Comment, ContractComment } from 'common/comment'
import { Json } from 'common/supabase/schema'
import { useEffect, useState } from 'react'
import {
  getAllComments,
  getComments,
  getNumUserComments,
  getUserComments,
} from 'web/lib/supabase/comments'
import { db } from 'web/lib/supabase/db'

export function useComments(contractId: string, limit: number) {
  const [comments, setComments] = useState<Json[]>([])

  useEffect(() => {
    if (contractId) {
      getAllComments(contractId, limit).then((result) => setComments(result))
    }
  }, [contractId])

  return comments
}

export function useUserComments(userId: string, limit: number, page: number) {
  const [comments, setComments] = useState<ContractComment[]>([])

  useEffect(() => {
    if (userId) {
      getUserComments(userId, limit, page).then((result) => setComments(result))
    }
    console.log(comments)
  }, [userId, limit, page])

  return comments
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
