import { LeagueBidTxn } from 'common/txn'
import { maxBy } from 'lodash'
import { useEffect } from 'react'
import { listenForLeagueBidTxn } from 'web/lib/firebase/txns'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'

export type CommentTips = { [userId: string]: number }
export type CommentTipMap = { [commentId: string]: CommentTips }

export function useLeagueBid(season: number, division: number, cohort: string) {
  const [maxBidTxn, setMaxBidTxn] = usePersistentInMemoryState<
    LeagueBidTxn | undefined
  >(undefined, `league-bid-txn-${season}-${division}-${cohort}`)

  useEffect(() => {
    return listenForLeagueBidTxn(season, division, cohort, (txns) => {
      const maxBid = maxBy(txns, 'amount')
      console.log('txns', txns)
      if (maxBid) setMaxBidTxn(maxBid)
      else setMaxBidTxn(undefined)
    })
  }, [setMaxBidTxn, season, division, cohort])

  return maxBidTxn
}
