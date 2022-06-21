import { TipTxn } from 'common/txn'
import { groupBy, mapValues, sumBy } from 'lodash'
import { useEffect, useMemo, useState } from 'react'
import { listenForTipTxns } from 'web/lib/firebase/txns'

export type CommentTips = { [userId: string]: number }
export type CommentTipMap = { [commentId: string]: CommentTips }

export function useTipTxns(contractId: string): CommentTipMap {
  const [txns, setTxns] = useState<TipTxn[]>([])

  useEffect(() => {
    return listenForTipTxns(contractId, setTxns)
  }, [contractId, setTxns])

  return useMemo(() => {
    const byComment = groupBy(txns, 'data.commentId')
    return mapValues(byComment, (txns) => {
      const bySender = groupBy(txns, 'fromId')
      return mapValues(bySender, (t) => sumBy(t, 'amount'))
    })
  }, [txns])
}
