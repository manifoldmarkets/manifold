import { Contract } from 'common/contract'
import { User } from 'common/user'
import { ContractComment } from 'common/comment'
import { useEffect, useRef, useState } from 'react'
import { buildArray, filterDefined } from 'common/util/array'
import { usePrivateUser } from './use-user'
import { isContractBlocked } from 'web/lib/firebase/users'
import { useEvent } from './use-event'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'
import { getBoosts } from 'web/lib/supabase/ads'
import { BoostsType } from 'web/hooks/use-feed'
import { run } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'
import { last, uniq } from 'lodash'
import { News } from 'common/news'

const PAGE_SIZE = 20

type FeedTimelineItem = {
  dataType: string
  contractId: string | null
  commentId: string | null
  newsId: string | null
  createdTime: number
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
  const [savedContracts, setSavedContracts] = usePersistentInMemoryState<
    Contract[] | undefined
  >(undefined, `timeline-contracts-${user?.id}-${key}`)
  const [savedComments, setSavedComments] = usePersistentInMemoryState<
    ContractComment[] | undefined
  >(undefined, `timeline-comments-${user?.id}-${key}`)
  const [savedNews, setSavedNews] = usePersistentInMemoryState<
    News[] | undefined
  >(undefined, `timeline-news-${user?.id}-${key}`)
  const [probabilityChanges, setProbabilityChanges] =
    usePersistentInMemoryState<Contract[] | undefined>(
      undefined,
      `timeline-probability-changes-${user?.id}-${key}`
    )

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
    const timelineItems = data.map((item) => ({
      dataType: item.data_type,
      contractId: item.contract_id,
      commentId: item.comment_id,
      newsId: item.news_id,
      createdTime: new Date(item.created_time).valueOf(),
    }))
    // This can include new contracts and contracts with probability updates
    const contractIds = uniq(
      filterDefined(timelineItems.map((item) => item.contractId))
    )
    // This can include new comments and comments with new likes
    const commentIds = uniq(
      filterDefined(timelineItems.map((item) => item.commentId))
    )
    const newsIds = uniq(
      filterDefined(timelineItems.map((item) => item.newsId))
    )
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
              urlToImage: news.image_url,
            })) as News[]
        ),
    ])
    const lastItem = last(timelineItems)
    lastCreatedTime.current = lastItem?.createdTime ?? lastCreatedTime.current
    return {
      timelineItems,
      comments,
      contracts,
      news,
    }
  }

  const loadMore = useEvent(() => {
    if (!userId) return
    fetchRecs(userId).then((res) => {
      const { timelineItems, comments, contracts, news } = res
      setSavedFeedItems(buildArray(savedFeedItems, timelineItems))
      setSavedNews(buildArray(savedNews, news))
      setSavedContracts(buildArray(savedContracts, contracts))
      setSavedComments(buildArray(savedComments, comments))
    })
  })

  useEffect(() => {
    loadMore()
  }, [userId])

  const filteredContracts = savedContracts?.filter(
    (c) => !isContractBlocked(privateUser, c)
  )
  const filteredComments = savedComments?.filter(
    (c) => !privateUser?.blockedUserIds?.includes(c.userId)
  )

  return {
    contracts: filteredContracts,
    comments: filteredComments,
    news: savedNews,
    boosts,
    loadMore,
  }
}
