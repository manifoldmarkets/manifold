import { ContractComment, PostComment } from 'common/comment'
import { useEffect, useState } from 'react'
import {
  convertContractComment,
  getAllCommentRows,
  getCommentRows,
  getCommentsOnContract,
  getNewCommentRows,
  getNumContractComments,
  getNumUserComments,
  getPostCommentRows,
} from 'web/lib/supabase/comments'
import { useSubscription } from 'web/lib/supabase/realtime/use-subscription'
import { maxBy } from 'lodash'
import { tsToMillis } from 'common/supabase/utils'

export function useNumContractComments(contractId: string) {
  const [numComments, setNumComments] = useState<number>(0)

  useEffect(() => {
    if (contractId) {
      getNumContractComments(contractId).then((result) =>
        setNumComments(result)
      )
    }
  }, [contractId])

  return numComments
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

export function useCommentsOnContract(contractId: string) {
  const [comments, setComments] = useState<ContractComment[] | undefined>(
    undefined
  )
  useEffect(() => {
    getCommentsOnContract(contractId).then((comments) => {
      setComments(comments)
    })
  }, [contractId])
  return comments
}
// TODO: the loadNewerQuery doesn't query for comment edits via updated_time
export function useRealtimeCommentsOnContract(contractId: string) {
  const { rows, loadNewer } = useSubscription(
    'contract_comments',
    { k: 'contract_id', v: contractId },
    () => getCommentRows(contractId),
    undefined,
    undefined,
    (rows) =>
      getNewCommentRows(
        contractId,
        maxBy(rows ?? [], (r) => tsToMillis(r.created_time))?.created_time ??
          new Date(Date.now() - 500).toISOString()
      )
  )

  return { rows: rows?.map(convertContractComment), loadNewer }
}

export function useRealtimeComments(
  limit: number
): ContractComment[] | undefined {
  const { rows } = useSubscription('contract_comments', undefined, () =>
    getAllCommentRows(limit)
  )
  return rows?.map((r) => r.data as ContractComment)
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
