import { User } from 'common/user'
import { useUnseenReplyChainCommentsOnContracts } from 'web/hooks/use-comments-supabase'
import { DAY_MS } from 'common/util/time'
import { groupBy, orderBy, sortBy, uniqBy } from 'lodash'
import { useEffect } from 'react'
import { Bet } from 'common/bet'
import { getBetsOnContracts } from 'web/lib/supabase/bets'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'

export const useFeedComments = (
  user: User | null | undefined,
  contractIds: string[]
) => {
  const unseenCommentThreads = useUnseenReplyChainCommentsOnContracts(
    contractIds,
    user?.id ?? '_'
  )
  const parentCommentsByContractId = groupBy(
    orderBy(
      unseenCommentThreads.filter((c) => !c.replyToCommentId),
      [(c) => c.likes ?? 0, (c) => c.createdTime],
      ['desc', 'desc']
    ),
    (c) => c.contractId
  )

  const childCommentsByParentCommentId = groupBy(
    sortBy(
      unseenCommentThreads.filter((c) => c.replyToCommentId),
      (c) => c.createdTime
    ),
    (c) => c.replyToCommentId
  )

  return {
    parentCommentsByContractId,
    childCommentsByParentCommentId,
  }
}

export const useFeedBets = (
  user: User | null | undefined,
  contractIds: string[]
) => {
  const [bets, setBets] = usePersistentInMemoryState<Bet[]>(
    [],
    `recent-feed-bets-${user?.id ?? '_'}`
  )
  useEffect(() => {
    if (contractIds.length > 0) {
      getBetsOnContracts(contractIds, {
        afterTime: Date.now() - DAY_MS,
        filterAntes: true,
        filterChallenges: true,
        filterRedemptions: true,
      }).then((result) => {
        if (user) result = result.filter((b) => b.userId !== user.id)
        setBets((prev) => uniqBy([...prev, ...result], (b) => b.id))
      })
    }
  }, [JSON.stringify(contractIds), user])
  return bets
}
