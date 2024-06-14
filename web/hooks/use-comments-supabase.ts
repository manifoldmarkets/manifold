import { ContractComment } from 'common/comment'
import { useEffect, useState } from 'react'
import { useEvent } from 'web/hooks/use-event'
import { sortBy, uniqBy } from 'lodash'

import {
  getAllCommentRows,
  getComment,
  getCommentRows,
  getNewCommentRows,
  getNumContractComments,
} from 'web/lib/supabase/comments'
import { useSubscription } from 'web/lib/supabase/realtime/use-subscription'
import { maxBy, orderBy } from 'lodash'
import { Row, tsToMillis } from 'common/supabase/utils'
import { convertContractComment } from 'common/supabase/comments'
import { api } from 'web/lib/firebase/api'
import { db } from 'web/lib/supabase/db'
import { usePersistentSupabasePolling } from 'web/hooks/use-persistent-supabase-polling'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'
import { useApiSubscription } from './use-api-subscription'

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

export function useCommentsOnContract(contractId: string) {
  const [comments, setComments] = useState<ContractComment[] | undefined>(
    undefined
  )
  useEffect(() => {
    api('comments', { contractId }).then((comments) => {
      setComments(comments)
    })
  }, [contractId])
  return comments
}

export function useCommentOnContract(commentId: string) {
  const [comment, setComment] = useState<ContractComment | undefined | null>(
    undefined
  )
  useEffect(() => {
    getComment(commentId).then(setComment)
  }, [commentId])
  return comment
}
// TODO: the loadNewerQuery doesn't query for comment edits (e.g. via fs_updated_time).
//This is okay for now as we're optimistically updating comments via useState.
export function useRealtimeCommentsOnContract(
  contractId: string,
  userId?: string
) {
  const { rows, dispatch } = useSubscription(
    'contract_comments',
    { k: 'contract_id', v: contractId },
    () => getCommentRows(contractId)
  )

  const loadNewer = useEvent(async () => {
    const retryLoadNewer = async (attemptNumber: number) => {
      const newRows = await getNewCommentRows(
        contractId,
        maxBy(rows ?? [], (r) => tsToMillis(r.created_time))?.created_time ??
          new Date(Date.now() - 500).toISOString(),
        userId
      )
      if (newRows?.length) {
        for (const r of newRows) {
          // really is an upsert
          dispatch({ type: 'CHANGE', change: { eventType: 'INSERT', new: r } })
        }
      } else if (attemptNumber < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 100 * attemptNumber))
      }
    }

    const maxAttempts = 10
    await retryLoadNewer(1)
  })

  return { rows: rows?.map(convertContractComment), loadNewer }
}

export const useSubscribeGlobalComments = () => {
  const [newComments, setNewComments] = usePersistentInMemoryState<
    ContractComment[]
  >([], 'global-new-comments')

  const addComment = (comment: ContractComment) => {
    setNewComments((currentComments) =>
      sortBy(uniqBy([...currentComments, comment], 'id'), 'createdTime')
    )
  }

  useApiSubscription({
    topics: [`global/new-comment`],
    onBroadcast: (msg) => {
      addComment(msg.data.comment as ContractComment)
    },
  })

  return newComments
}

export const useGlobalComments = (limit: number) => {
  const [comments, setComments] = usePersistentInMemoryState<
    ContractComment[] | undefined
  >(undefined, `global-comments-${limit}`)

  useEffect(() => {
    getAllCommentRows(limit).then((rows) =>
      setComments(rows.map(convertContractComment))
    )
  }, [limit])

  return comments
}

export function useRealtimeCommentsPolling(
  contractId: string,
  afterTime: number,
  ms: number
) {
  const allRowsQ = db
    .from('contract_comments')
    .select()
    .eq('contract_id', contractId)
    .gt('created_time', new Date(afterTime).toISOString())

  const newRowsOnlyQ = (rows: Row<'contract_comments'>[] | undefined) => {
    // You can't use allRowsQ here because it keeps tacking on another gt clause
    const latestCreatedTime = maxBy(rows, 'created_time')?.created_time
    return db
      .from('contract_comments')
      .select()
      .eq('contract_id', contractId)
      .gt(
        'created_time',
        latestCreatedTime ?? new Date(afterTime ?? 0).toISOString()
      )
  }

  const results = usePersistentSupabasePolling(
    'contract_comments',
    allRowsQ,
    newRowsOnlyQ,
    `contract-comments-${contractId}-${ms}ms-v1`,
    {
      ms,
      deps: [contractId],
      shouldUseLocalStorage: false,
    }
  )
  return results
    ? orderBy(results.map(convertContractComment), 'createdTime', 'desc')
    : undefined
}
