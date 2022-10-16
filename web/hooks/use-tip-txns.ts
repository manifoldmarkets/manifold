import { TipTxn } from 'common/txn'
import { groupBy, mapValues, sumBy } from 'lodash'
import { useEffect, useMemo, useState } from 'react'
import {
  listenForTipTxns,
  listenForTipTxnsOnGroup,
  listenForTipTxnsOnPost,
} from 'web/lib/firebase/txns'

export type CommentTips = { [userId: string]: number }
export type CommentTipMap = { [commentId: string]: CommentTips }

export function useTipTxns(on: {
  contractId?: string
  groupId?: string
  postId?: string
}): CommentTipMap {
  const [txns, setTxns] = useState<TipTxn[]>([])
  const { contractId, groupId, postId } = on

  useEffect(() => {
    if (contractId) return listenForTipTxns(contractId, setTxns)
    if (groupId) return listenForTipTxnsOnGroup(groupId, setTxns)
    if (postId) return listenForTipTxnsOnPost(postId, setTxns)
  }, [contractId, groupId, postId, setTxns])

  return useMemo(() => {
    const byComment = groupBy(txns, 'data.commentId')
    return mapValues(byComment, (txns) => {
      const bySender = groupBy(txns, 'fromId')
      return mapValues(bySender, (t) => sumBy(t, 'amount'))
    })
  }, [txns])
}

export function useItemTipTxns(itemId: string): TipTxn[] {
  const [txns, setTxns] = useState<TipTxn[]>([])

  useEffect(() => {
    return listenForTipTxns(itemId, (txns) => {
      setTxns(txns.filter((txn) => !txn.data.commentId))
    })
  }, [itemId])

  return txns
}
