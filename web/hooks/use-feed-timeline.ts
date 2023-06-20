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
import { first, groupBy, last, sortBy, uniq, uniqBy } from 'lodash'
import { News } from 'common/news'
import { FEED_DATA_TYPES, FEED_REASON_TYPES, getExplanation } from 'common/feed'
import { isContractBlocked } from 'web/lib/firebase/users'

const PAGE_SIZE = 20

export type FeedTimelineItem = {
  // These are stored in the db
  id: number
  dataType: FEED_DATA_TYPES
  reason: FEED_REASON_TYPES
  createdTime: number
  supabaseTimestamp: string
  contractId: string | null
  commentId: string | null
  newsId: string | null
  // These are fetched/generated at runtime
  avatarUrl: string | null
  contract?: Contract
  contracts?: Contract[]
  comments?: ContractComment[]
  news?: News
  reasonDescription?: string
}
export const useFeedTimeline = (user: User | null | undefined, key: string) => {
  const [boosts, setBoosts] = usePersistentInMemoryState<
    BoostsType | undefined
  >(undefined, `boosts-${user?.id}-${key}`)
  useEffect(() => {
    if (user) getBoosts(user.id).then(setBoosts as any)
  }, [user?.id])

  const [savedFeedItems, setSavedFeedItems] = usePersistentInMemoryState<
    FeedTimelineItem[] | undefined
  >(undefined, `timeline-items-${user?.id}-${key}`)

  const privateUser = usePrivateUser()
  const userId = user?.id
  // Supabase timestamptz has more precision than js Date, so we need to store the oldest and newest timestamps as strings
  const newestCreatedTimestamp = useRef(
    first(savedFeedItems)?.supabaseTimestamp ?? new Date().toISOString()
  )
  const oldestCreatedTimestamp = useRef(
    last(savedFeedItems)?.supabaseTimestamp ?? new Date().toISOString()
  )

  const fetchFeedItems = async (
    userId: string,
    options: {
      new?: boolean
      newerThan?: string
      old?: boolean
    }
  ) => {
    const time = options.new
      ? new Date().toISOString()
      : oldestCreatedTimestamp.current
    let query = db
      .from('user_feed')
      .select('*')
      .eq('user_id', userId)
      .lt('created_time', time)
      .order('created_time', { ascending: false })
      .limit(PAGE_SIZE)
    if (options.newerThan) {
      query = query.gt('created_time', options.newerThan)
    }

    const { data } = await run(query)

    // Filter out already saved ones to reduce bandwidth and avoid duplicates
    const alreadySavedContractIds = filterDefined(
      savedFeedItems?.map((item) => item.contractId) ?? []
    )

    const contractIds = uniq(
      filterDefined(data.map((item) => item.contract_id)).filter(
        (id) => !alreadySavedContractIds.includes(id)
      )
    )
    const commentIds = uniq(
      filterDefined(
        data.map((item) =>
          alreadySavedContractIds.includes(item.contract_id ?? '_')
            ? undefined
            : item.comment_id
        )
      )
    )

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

    // It's possible we're missing contracts for news items bc of the duplicate filter
    const timelineItems = createFeedTimelineItems(
      data,
      filteredContracts,
      filteredComments,
      news
    )

    return { timelineItems }
  }

  const addTimelineItems = useEvent(
    (
      timelineItems: FeedTimelineItem[],
      options: { new?: boolean; old?: boolean }
    ) => {
      if (options.new || !savedFeedItems?.length)
        newestCreatedTimestamp.current =
          first(timelineItems)?.supabaseTimestamp ??
          newestCreatedTimestamp.current
      if (!options.new || options.old || !savedFeedItems?.length)
        oldestCreatedTimestamp.current =
          last(timelineItems)?.supabaseTimestamp ??
          oldestCreatedTimestamp.current
      if (options.new) {
        setSavedFeedItems(
          uniqBy(buildArray(timelineItems, savedFeedItems), 'id')
        )
      } else
        setSavedFeedItems(
          uniqBy(buildArray(savedFeedItems, timelineItems), 'id')
        )
    }
  )

  const loadMore = useEvent(
    async (options: { new?: boolean; old?: boolean; newerThan?: string }) => {
      if (!userId) return
      return fetchFeedItems(userId, options).then((res) => {
        const { timelineItems } = res
        addTimelineItems(timelineItems, options)
      })
    }
  )

  const checkForNewer = useEvent(async () => {
    if (!userId) return []
    const { timelineItems } = await fetchFeedItems(userId, {
      new: true,
      newerThan: newestCreatedTimestamp.current,
    })
    return timelineItems
  })

  useEffect(() => {
    if (savedFeedItems?.length || !userId) return
    loadMore({ new: true })
  }, [loadMore, userId])

  return {
    loadNew: async () => loadMore({ new: true }),
    loadMoreOlder: async () => loadMore({ old: true }),
    checkForNewer: async () => checkForNewer(),
    addTimelineItems,
    boosts,
    savedFeedItems,
  }
}

const getBaseTimelineItem = (item: Row<'user_feed'>) =>
  ({
    id: item.id,
    dataType: item.data_type as FEED_DATA_TYPES,
    reason: item.reason as FEED_REASON_TYPES,
    reasonDescription: getExplanation(
      item.data_type as FEED_DATA_TYPES,
      item.reason as FEED_REASON_TYPES
    ),
    createdTime: new Date(item.created_time).valueOf(),
    supabaseTimestamp: item.created_time,
  } as FeedTimelineItem)

function createFeedTimelineItems(
  data: Row<'user_feed'>[],
  contracts: Contract[] | undefined,
  comments: ContractComment[] | undefined,
  news: News[] | undefined
): FeedTimelineItem[] {
  const newsData = Object.entries(
    groupBy(
      data.filter((d) => d.news_id),
      (item) => item.news_id
    )
  ).map(([newsId, newsItems]) => {
    const contractIds = data
      .filter((item) => item.news_id === newsId)
      .map((i) => i.contract_id)
    const relevantContracts = contracts?.filter((contract) =>
      contractIds.includes(contract.id)
    )
    return {
      ...getBaseTimelineItem(newsItems[0]),
      newsId,
      avatarUrl: relevantContracts?.[0]?.creatorAvatarUrl,
      contracts: relevantContracts,
      news: news?.find((news) => news.id === newsId),
    } as FeedTimelineItem
  })
  // TODO: The uniqBy will coalesce contract-based feed timeline elements non-deterministically
  const nonNewsTimelineItems = uniqBy(
    data.map((item) => {
      const dataType = item.data_type as FEED_DATA_TYPES
      // Parse new feed timeline data types here
      if (
        dataType === 'contract_probability_changed' ||
        dataType === 'new_comment' ||
        dataType === 'new_contract' ||
        dataType === 'popular_comment' ||
        dataType === 'trending_contract'
      ) {
        const relevantContract = contracts?.find(
          (contract) => contract.id === item.contract_id
        )
        // We may not find a relevant contract if they've already seen the same contract in their feed
        if (!relevantContract) return
        // If the contract is closed/resolved, only show it due to market movements or trending.
        // Otherwise, we don't need to see comments on closed/resolved markets
        if (
          shouldIgnoreCommentsOnContract(relevantContract) &&
          (dataType === 'new_comment' || dataType === 'popular_comment')
        )
          return

        const relevantComments = comments?.filter(
          (comment) => comment.contractId === item.contract_id
        )
        return {
          ...getBaseTimelineItem(item),
          contractId: item.contract_id,
          commentId: item.comment_id,
          avatarUrl: item.comment_id
            ? relevantComments?.[0]?.userAvatarUrl
            : relevantContract?.creatorAvatarUrl,
          contract: relevantContract,
          comments: relevantComments,
        } as FeedTimelineItem
      }
    }),
    'contractId'
  )
  return sortBy(
    filterDefined([...newsData, ...nonNewsTimelineItems]),
    (i) => -i.createdTime
  )
}

export const shouldIgnoreCommentsOnContract = (contract: Contract): boolean => {
  return (
    contract.isResolved ||
    (contract.closeTime ? contract.closeTime < Date.now() : false)
  )
}
