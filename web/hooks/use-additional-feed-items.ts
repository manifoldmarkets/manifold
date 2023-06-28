import { User } from 'common/user'
import { useUnseenReplyChainCommentsOnContracts } from 'web/hooks/use-comments-supabase'
import { DAY_MS } from 'common/util/time'
import { groupBy, orderBy, sortBy, uniqBy } from 'lodash'
import { useEffect } from 'react'
import { Bet } from 'common/bet'
import { getBetsOnContracts } from 'web/lib/supabase/bets'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { ContractComment } from 'common/comment'
export const IGNORE_COMMENT_FEED_CONTENT = ['gridCardsComponent']
export const groupCommentsByContractsAndParents = (
  comments: ContractComment[]
) => {
  // Grid cards make for huge, unwieldy comment threads
  const filteredUnseenCommentThreads = comments.filter(
    (ct) =>
      !ct.content?.content?.some((c) =>
        IGNORE_COMMENT_FEED_CONTENT.includes(c.type ?? '')
      )
  )
  const parentCommentsByContractId = groupBy(
    orderBy(
      filteredUnseenCommentThreads.filter((c) => !c.replyToCommentId),
      [(c) => c.likes ?? 0, (c) => c.createdTime],
      ['desc', 'desc']
    ),
    (c) => c.contractId
  )

  const childCommentsByParentCommentId = groupBy(
    sortBy(
      filteredUnseenCommentThreads.filter((c) => c.replyToCommentId),
      (c) => c.createdTime
    ),
    (c) => c.replyToCommentId
  )
  return {
    parentCommentsByContractId,
    childCommentsByParentCommentId,
  }
}
export const useFeedComments = (
  user: User | null | undefined,
  contractIds: string[]
) => {
  const unseenCommentThreads = useUnseenReplyChainCommentsOnContracts(
    contractIds,
    user?.id ?? '_'
  )

  return groupCommentsByContractsAndParents(unseenCommentThreads)
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
        filterChallenges: false,
        filterRedemptions: true,
      }).then((result) => {
        if (user) result = result.filter((b) => b.userId !== user.id)
        setBets((prev) => uniqBy([...prev, ...result], (b) => b.id))
      })
    }
  }, [JSON.stringify(contractIds), user])
  return bets
}
