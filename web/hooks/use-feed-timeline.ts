import { Contract } from 'common/contract'
import { PrivateUser, User } from 'common/user'
import { ContractComment } from 'common/comment'
import { useEffect, useRef } from 'react'
import { buildArray, filterDefined } from 'common/util/array'
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
import { IGNORE_COMMENT_FEED_CONTENT } from 'web/hooks/use-additional-feed-items'
import { DAY_MS } from 'common/util/time'

const PAGE_SIZE = 25
const OLDEST_UNSEEN_TIME_OF_INTEREST = Date.now() - 3 * DAY_MS

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
  isCopied?: boolean
}
export const useFeedTimeline = (
  user: User | null | undefined,
  privateUser: PrivateUser | null | undefined,
  key: string
) => {
  const [boosts, setBoosts] = usePersistentInMemoryState<
    BoostsType | undefined
  >(undefined, `boosts-${user?.id}-${key}`)
  useEffect(() => {
    if (privateUser) getBoosts(privateUser).then(setBoosts)
  }, [privateUser])

  const [savedFeedItems, setSavedFeedItems] = usePersistentInMemoryState<
    FeedTimelineItem[] | undefined
  >(undefined, `timeline-items-${user?.id}-${key}`)

  const userId = user?.id
  // Supabase timestamptz has more precision than js Date, so we need to store the oldest and newest timestamps as strings
  const newestCreatedTimestamp = useRef(
    first(savedFeedItems)?.supabaseTimestamp ?? new Date().toISOString()
  )
  const oldestCreatedTimestamp = useRef(
    last(savedFeedItems)?.supabaseTimestamp ?? new Date().toISOString()
  )
  const fetching = useRef(false)
  const unseenCount = useRef(100)
  const getUnseenCount = async () => {
    if (
      new Date(oldestCreatedTimestamp.current).valueOf() <
      OLDEST_UNSEEN_TIME_OF_INTEREST
    ) {
      unseenCount.current = 0
      return
    }
    const unseenCountQuery = db
      .from('user_feed')
      .select('*', { head: true, count: 'exact' })
      .eq('user_id', userId)
      .is('seen_time', null)
      .lt('created_time', oldestCreatedTimestamp.current)
      .gt(
        'created_time',
        new Date(OLDEST_UNSEEN_TIME_OF_INTEREST).toISOString()
      )
    const unseenCountData = await unseenCountQuery
    unseenCount.current = unseenCountData.count ?? 0
  }
  const fetchFeedItems = async (
    userId: string,
    options: {
      newerThan?: string
      old?: boolean
    }
  ) => {
    if (fetching.current) return { timelineItems: [] as FeedTimelineItem[] }
    let query = db
      .from('user_feed')
      .select('*')
      .eq('user_id', userId)
      .order('created_time', { ascending: false })
      .limit(PAGE_SIZE)
    // Newer items should never be seen, don't need to filter them
    if (options.newerThan) {
      query = query.gt('created_time', options.newerThan)
    }
    if (options.old) {
      query = query.lt('created_time', oldestCreatedTimestamp.current)
      if (unseenCount.current > 10) query = query.is('seen_time', null)
    }
    const { data } = await run(query)
    if (options.old && unseenCount.current > 0) {
      const newUnseens = data
        .map((item) => !item.seen_time)
        .filter(Boolean).length
      unseenCount.current = unseenCount.current - newUnseens
    }

    // Filter out already saved ones to reduce bandwidth and avoid duplicates
    const alreadySavedContractIds = filterDefined(
      savedFeedItems?.map((item) => item.contractId) ?? []
    )

    const newContractIds = uniq(
      filterDefined(data.map((item) => item.contract_id)).filter(
        (id) => !alreadySavedContractIds.includes(id)
      )
    )
    const newCommentsOnContractIds = uniq(
      filterDefined(data.map((item) => item.comment_id))
    )

    const potentiallySeenCommentIds = uniq(
      filterDefined(
        data.map((item) => (item.seen_time ? null : item.comment_id))
      )
    )
    const alreadySavedNewsIds = filterDefined(
      savedFeedItems?.map((item) => item.newsId) ?? []
    )
    const newsIds = uniq(
      filterDefined(
        data.map((item) =>
          item.news_id && !alreadySavedNewsIds.includes(item.news_id)
            ? item.news_id
            : null
        )
      )
    )
    const [
      comments,
      contracts,
      news,
      uninterestingContractIds,
      seenCommentIds,
    ] = await Promise.all([
      db
        .rpc('get_reply_chain_comments_for_comment_ids' as any, {
          comment_ids: newCommentsOnContractIds,
        })
        .then((res) => res.data?.map((c) => c.data as ContractComment)),
      db
        .from('contracts')
        .select('*')
        .in('id', newContractIds)
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
      db
        .from('user_disinterests')
        .select('contract_id')
        .eq('user_id', userId)
        .in('contract_id', newContractIds)
        .then((res) => res.data?.map((c) => c.contract_id)),
      db
        .from('user_events')
        .select('comment_id')
        .eq('user_id', userId)
        .eq('name', 'view comment thread')
        .in('comment_id', potentiallySeenCommentIds)
        .gt('ts', new Date(Date.now() - 5 * DAY_MS).toISOString())
        .then((res) => res.data?.map((c) => c.comment_id)),
    ])

    const filteredNewContracts = contracts?.filter(
      (c) =>
        !isContractBlocked(privateUser, c) &&
        !c.isResolved &&
        !uninterestingContractIds?.includes(c.id)
    )
    const filteredNewComments = comments?.filter(
      (c) =>
        !privateUser?.blockedUserIds?.includes(c.userId) &&
        !c.hidden &&
        !seenCommentIds?.includes(c.id)
    )
    // New comments on contracts they've already seen in their feed can be interesting
    const savedContractsWithNewComments: Contract[] = filterDefined(
      (filteredNewComments ?? []).map(
        (item) =>
          savedFeedItems?.find((i) => i.contractId === item.contractId)
            ?.contract
      )
    )

    // It's possible we're missing contracts for news items bc of the duplicate filter
    const timelineItems = createFeedTimelineItems(
      data,
      (filteredNewContracts ?? []).concat(savedContractsWithNewComments),
      filteredNewComments,
      news
    )
    fetching.current = false

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
    async (options: { old?: boolean; newerThan?: string }) => {
      if (!userId) return false
      const res = await fetchFeedItems(userId, options)
      const { timelineItems } = res
      addTimelineItems(timelineItems, options)
      return timelineItems.length > 0
    }
  )

  const checkForNewer = useEvent(async () => {
    if (!userId) return []
    const { timelineItems } = await fetchFeedItems(userId, {
      newerThan: newestCreatedTimestamp.current,
    })
    return timelineItems
  })

  useEffect(() => {
    if (savedFeedItems?.length || !userId) return
    getUnseenCount()
    loadMore({ old: true })
  }, [loadMore, userId])

  return {
    loadMoreOlder: async () => loadMore({ old: true }),
    checkForNewer: async () => checkForNewer(),
    addTimelineItems,
    boosts: boosts?.filter(
      (b) =>
        !(savedFeedItems?.map((f) => f.contractId) ?? []).includes(b.market_id)
    ),
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
    isCopied: item.is_copied,
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
    data
      .filter((d) => !d.news_id && d.contract_id)
      .map((item) => {
        const dataType = item.data_type as FEED_DATA_TYPES
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

        // Let's stick with one comment per feed item for now
        const relevantComments = comments
          ?.filter((comment) => comment.id === item.comment_id)
          .filter(
            (ct) =>
              !ct.content?.content?.some((c) =>
                IGNORE_COMMENT_FEED_CONTENT.includes(c.type ?? '')
              )
          )
        if (item.comment_id && !relevantComments?.length) return
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
