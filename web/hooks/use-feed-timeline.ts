import { Contract } from 'common/contract'
import { User } from 'common/user'
import { ContractComment } from 'common/comment'
import { useEffect, useRef, useState } from 'react'
import { buildArray, filterDefined } from 'common/util/array'
import { usePrivateUser } from './use-user'
import { useEvent } from './use-event'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'
import { getBoosts } from 'web/lib/supabase/ads'
import { BoostsType } from 'web/hooks/use-feed'
import { run } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'
import { last, uniq, uniqBy } from 'lodash'
import { News } from 'common/news'
import { FEED_DATA_TYPES, FEED_REASON_TYPES, getExplanation } from 'common/feed'
import { isContractBlocked } from 'web/lib/firebase/users'

const PAGE_SIZE = 20

export type FeedTimelineItem = {
  dataType: FEED_DATA_TYPES
  reason: FEED_REASON_TYPES | null
  contractId: string | null
  commentId: string | null
  newsId: string | null
  createdTime: number
  contract: Contract | undefined
  comments: ContractComment[] | undefined
  news: News | undefined
  reasonDescription: string | undefined
}
export const useFeedTimeline = (user: User | null | undefined, key: string) => {
  const [boosts, setBoosts] = useState<BoostsType>()
  useEffect(() => {
    if (user) getBoosts(user.id).then(setBoosts as any)
  }, [user?.id])

  // I could get new contracts, new comments on contracts, contract probability changes, news articles with relevant contracts
  const [savedFeedItems, setSavedFeedItems] = usePersistentInMemoryState<
    FeedTimelineItem[] | undefined
  >(undefined, `timeline-items-${user?.id}-${key}`)

  const privateUser = usePrivateUser()
  const userId = user?.id
  const lastCreatedTime = useRef(Date.now())

  const fetchRecs = async (userId: string) => {
    // TODO: we could turn this into separate db rpc calls, i.e.:
    // get_contracts_for_user_feed, get_comments_for_user_feed, get_news_for_user_feed
    const { data } = await run(
      db
        .from('user_feed')
        .select('*')
        .eq('user_id', userId)
        .lt('created_time', new Date(lastCreatedTime.current).toISOString())
        .order('created_time', { ascending: false })
        .limit(PAGE_SIZE)
    )

    // This can include new contracts and contracts with probability updates
    const contractIds = uniq(
      filterDefined(data.map((item) => item.contract_id))
    )
    // This can include new comments and comments with new likes
    const commentIds = uniq(filterDefined(data.map((item) => item.comment_id)))
    const newsIds = uniq(filterDefined(data.map((item) => item.news_id)))
    const [comments, contracts, news] = await Promise.all([
      db
        .rpc('get_reply_chain_comments_for_comment_ids' as any, {
          comment_ids: commentIds,
        })
        .then((res) => res.data?.map((c) => c.data as ContractComment)),
      db
        .from('contracts')
        .select('*')
        .in('id', contractIds)
        .then((res) => res.data?.map((c) => c.data as Contract)),
      db
        .from('news')
        .select('*')
        .in('id', newsIds)
        .then(
          (res) =>
            res.data?.map((news) => ({
              ...news,
              id: news.id.toString(),
              urlToImage: news.image_url,
            })) as News[]
        ),
    ])
    const filteredContracts = contracts?.filter(
      (c) => !isContractBlocked(privateUser, c)
    )
    const filteredComments = comments?.filter(
      (c) => !privateUser?.blockedUserIds?.includes(c.userId)
    )
    const timelineItems = data.map((item) => ({
      dataType: item.data_type as FEED_DATA_TYPES,
      reason: item.reason as FEED_REASON_TYPES,
      contractId: item.contract_id,
      commentId: item.comment_id,
      newsId: item.news_id,
      reasonDescription: getExplanation(
        item.data_type as FEED_DATA_TYPES,
        item.reason as FEED_REASON_TYPES
      ),
      createdTime: new Date(item.created_time).valueOf(),
      contract: filteredContracts?.find(
        (contract) => contract.id === item.contract_id
      ),
      comments: filteredComments?.filter(
        (comment) => comment.contractId === item.contract_id
      ),
      news: news?.find((news) => news.id === item.news_id),
    }))

    const lastItem = last(timelineItems)
    lastCreatedTime.current = lastItem?.createdTime ?? lastCreatedTime.current
    return {
      // TODO: The uniqBy will coalesce reason descriptions non-deterministically
      timelineItems: uniqBy(timelineItems, 'contractId'),
    }
  }

  const loadMore = useEvent(() => {
    if (!userId) return
    fetchRecs(userId).then((res) => {
      const { timelineItems } = res
      setSavedFeedItems(buildArray(savedFeedItems, timelineItems))
    })
  })

  useEffect(() => {
    loadMore()
  }, [userId])

  return {
    loadMore,
    boosts,
    feedTimelineItems: savedFeedItems,
  }
}
