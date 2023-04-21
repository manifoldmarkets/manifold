import { User } from 'common/user'
import { useRecentReplyChainCommentsOnContracts } from 'web/hooks/use-comments-supabase'
import { DAY_MS } from 'common/util/time'
import { orderBy, uniqBy } from 'lodash'
import { useEffect, useState } from 'react'
import { Bet } from 'common/bet'
import { getBetsOnContracts } from 'web/lib/supabase/bets'
import { filterDefined } from 'common/util/array'

export const useFeedComments = (
  user: User | null | undefined,
  contractIds: string[]
) => {
  const cutoff = Date.now() - DAY_MS * 10
  const recentComments = useRecentReplyChainCommentsOnContracts(
    contractIds,
    cutoff
  )
  return filterDefined(
    recentComments
      .filter((c) => !c.replyToCommentId)
      .map((pc) => {
        const childComments = orderBy(
          recentComments.filter((c) => c.replyToCommentId === pc.id),
          (c) => c.createdTime
        )
        return pc.userId === user?.id && childComments.length === 0
          ? null
          : {
              parentComment: pc,
              childComments,
            }
      })
  )
}

export const useFeedBets = (
  user: User | null | undefined,
  contractIds: string[]
) => {
  const [bets, setBets] = useState<Bet[]>([])
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
