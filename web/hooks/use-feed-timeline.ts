import { Contract } from 'common/contract'
import { User } from 'common/user'
import { ContractComment } from 'common/comment'
import { useEffect, useRef } from 'react'
import { buildArray, filterDefined } from 'common/util/array'
import { usePrivateUser } from './use-user'
import { useEvent } from './use-event'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'
import { getBoosts } from 'web/lib/supabase/ads'
import { BoostsType } from 'web/hooks/use-feed'
import { Row, run } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'
import { groupBy, last, sortBy, uniq, uniqBy } from 'lodash'
import { News } from 'common/news'
import { FEED_DATA_TYPES, FEED_REASON_TYPES, getExplanation } from 'common/feed'
import { isContractBlocked } from 'web/lib/firebase/users'

const PAGE_SIZE = 20

export type FeedTimelineItem = {
  // These are stored in the db
  dataType: FEED_DATA_TYPES
  reason: FEED_REASON_TYPES
  createdTime: number
  contractId: string | null
  commentId: string | null
  newsId: string | null
  // These are fetched/generated at runtime
  contract?: Contract
  contracts?: Contract[]
  comments?: ContractComment[]
  news?: News
  reasonDescription?: string
}
export const useFeedTimeline = (user: User | null | undefined, key: string) => {
  const [boosts, setBoosts] = usePersistentInMemoryState<BoostsType|undefined>(
    undefined,
    `boosts-${user?.id}-${key}`
  )
  useEffect(() => {
    if (user) getBoosts(user.id).then(setBoosts as any)
  }, [user?.id])

  // I could get new contracts, new comments on contracts, contract probability changes, news articles with relevant contracts
  const [savedFeedItems, setSavedFeedItems] = usePersistentInMemoryState<
    FeedTimelineItem[] | undefined
  >(undefined, `timeline-items-${user?.id}-${key}`)

  const privateUser = usePrivateUser()
  const userId = user?.id
  // Supabase timestamptz has more precision than js Date, so we need to store the oldest and newest timestamps as strings
  const oldestCreatedTimestamp = useRef(new Date().toISOString())
  const newestCreatedTimestamp =  useRef(new Date().toISOString())

  const fetchRecs = async (
    userId: string,
    options: {
      newerThan?: string
      olderThan?: string
    }
  ) => {
    // TODO: we could turn this into separate db rpc calls, i.e.:
    // get_contracts_for_user_feed, get_comments_for_user_feed, get_news_for_user_feed
    const time =
      options.newerThan ?? options.olderThan ?? oldestCreatedTimestamp.current
    let query = db
      .from('user_feed')
      .select('*')
      .eq('user_id', userId)
      .order('created_time', { ascending: false })
      .limit(PAGE_SIZE)
    options.olderThan
      ? (query = query.lt('created_time', time))
      : (query = query.gt('created_time', time))

    const { data } = await run(query)

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
        .then((res) =>
          res.data?.map(
            (news) =>
              ({
                ...news,
                id: news.id.toString(),
                urlToImage: news.image_url,
              } as News)
          )
        ),
    ])
    const filteredContracts = contracts?.filter(
      (c) => !isContractBlocked(privateUser, c)
    )
    const filteredComments = comments?.filter(
      (c) => !privateUser?.blockedUserIds?.includes(c.userId)
    )
    const timelineItems = createFeedTimelineItems(
      data,
      filteredContracts,
      filteredComments,
      news
    )

    if (options.newerThan || !savedFeedItems?.length)
      newestCreatedTimestamp.current = data[0]?.created_time ?? newestCreatedTimestamp.current

    if (options.olderThan || !savedFeedItems?.length)
      oldestCreatedTimestamp.current = last(data)?.created_time ?? oldestCreatedTimestamp.current

    return { timelineItems }
  }

  const loadMore = useEvent(
    async (options: { newerThan?: string; olderThan?: string }) => {
      if (!userId) return
      return fetchRecs(userId, options).then((res) => {
        const { timelineItems } = res
        if (options.newerThan)
          setSavedFeedItems(buildArray(timelineItems,savedFeedItems))
        else
          setSavedFeedItems(buildArray(savedFeedItems,timelineItems))
      })
    }
  )

  useEffect(() => {
    if (savedFeedItems?.length || !userId) return
    loadMore({ olderThan: oldestCreatedTimestamp.current })
  }, [loadMore, userId])

  return {
    loadMoreNewer: async ()=>loadMore({ newerThan: newestCreatedTimestamp.current }),
    loadMoreOlder: async ()=>loadMore({ olderThan: oldestCreatedTimestamp.current }),
    boosts,
    feedTimelineItems: savedFeedItems,
  }
}

const getBaseTimelineItem = (item: Row<'user_feed'>) => ({
  dataType: item.data_type as FEED_DATA_TYPES,
  reason: item.reason as FEED_REASON_TYPES,
  reasonDescription: getExplanation(
    item.data_type as FEED_DATA_TYPES,
    item.reason as FEED_REASON_TYPES
  ),
  createdTime: new Date(item.created_time).valueOf(),
})

function createFeedTimelineItems(
  data: Row<'user_feed'>[],
  contracts: Contract[] | undefined,
  comments: ContractComment[] | undefined,
  news: News[] | undefined
): (FeedTimelineItem | undefined)[] {
  const newsData = Object.entries(groupBy(data, (item) => item.news_id)).map(
    ([newsId, newsItems]) => {
      const contractIds = data
        .filter((item) => item.news_id === newsId)
        .map((i) => i.contract_id)
      return {
        ...getBaseTimelineItem(newsItems[0]),
        newsId,
        contracts: contracts?.filter((contract) =>
          contractIds.includes(contract.id)
        ),
        news: news?.find((news) => news.id === newsId),
      } as FeedTimelineItem
    }
  )
  // TODO: The uniqBy will coalesce contract-based feed timeline elements non-deterministically
  const nonNewsTimelineItems = uniqBy(
    data.map((item) => {
      const dataType = item.data_type as FEED_DATA_TYPES
      if (
        dataType === 'contract_probability_changed' ||
        dataType === 'new_comment' ||
        dataType === 'new_contract' ||
        dataType === 'popular_comment'
      ) {
        return {
          ...getBaseTimelineItem(item),
          contractId: item.contract_id,
          commentId: item.comment_id,
          contract: contracts?.find(
            (contract) => contract.id === item.contract_id
          ),
          comments: comments?.filter(
            (comment) => comment.contractId === item.contract_id
          ),
        } as FeedTimelineItem
      }
      // Add new feed timeline data types here
    }),
    'contractId'
  )
  return sortBy(
    filterDefined([...newsData, ...nonNewsTimelineItems]),
    'createdTime'
  ).reverse()
}
