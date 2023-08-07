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
import {
  countBy,
  first,
  groupBy,
  last,
  orderBy,
  range,
  sortBy,
  uniq,
  uniqBy,
} from 'lodash'
import { News } from 'common/news'
import { FEED_DATA_TYPES, FEED_REASON_TYPES, getExplanation } from 'common/feed'
import { isContractBlocked } from 'web/lib/firebase/users'
import { IGNORE_COMMENT_FEED_CONTENT } from 'web/hooks/use-additional-feed-items'
import { DAY_MS } from 'common/util/time'
import { convertContractComment } from 'web/lib/supabase/comments'
import { Group } from 'common/group'
import { getMarketMovementInfo } from 'web/lib/supabase/feed-timeline/feed-market-movement-display'
import { DEEMPHASIZED_GROUP_SLUGS } from 'common/envs/constants'
import { useFollowedIdsSupabase } from 'web/hooks/use-follows'

const PAGE_SIZE = 50
const OLDEST_UNSEEN_TIME_OF_INTEREST = new Date(
  Date.now() - 5 * DAY_MS
).toISOString()

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
  groups?: Group[]
  news?: News
  reasonDescription?: string
  isCopied?: boolean
  data?: Record<string, any>
  manuallyCreatedFromContract?: boolean
}
const baseUserFeedQuery = (userId: string, privateUser: PrivateUser) =>
  db
    .from('user_feed')
    .select('*')
    .eq('user_id', userId)
    .not(
      'creator_id',
      'in',
      `(${privateUser.blockedUserIds.concat(privateUser.blockedByUserIds)})`
    )
    .not('contract_id', 'in', `(${privateUser.blockedContractIds})`)
    .order('created_time', { ascending: false })

export const useFeedTimeline = (
  user: User | null | undefined,
  privateUser: PrivateUser,
  key: string
) => {
  const [boosts, setBoosts] = usePersistentInMemoryState<
    BoostsType | undefined
  >(undefined, `boosts-${user?.id}-${key}`)
  useEffect(() => {
    getBoosts(privateUser).then(setBoosts)
  }, [])
  const followedIds = useFollowedIdsSupabase(privateUser.id)

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

  const fetchFeedItems = async (
    userId: string,
    options: {
      newerThan?: string
      old?: boolean
    }
  ) => {
    const newFeedRows = [] as Row<'user_feed'>[]
    let query = baseUserFeedQuery(userId, privateUser).limit(PAGE_SIZE)
    // TODO: if you're loading older, unseen stuff, newer stuff could be seen
    if (options.newerThan) {
      query = query.gt('created_time', options.newerThan)
    }
    if (options.old) {
      // get the highest priority items first
      const bestFeedRowsQuery = baseUserFeedQuery(userId, privateUser)
        .in('data_type', ['contract_probability_changed', 'trending_contract'])
        .gt('created_time', OLDEST_UNSEEN_TIME_OF_INTEREST)
        .lt('created_time', oldestCreatedTimestamp.current)
        .is('seen_time', null)
        .limit(15)
      const { data: highSignalData } = await run(bestFeedRowsQuery)
      newFeedRows.push(...highSignalData)

      query = query
        .gt('created_time', OLDEST_UNSEEN_TIME_OF_INTEREST)
        .is('seen_time', null)
        .lt('created_time', oldestCreatedTimestamp.current)
      if (highSignalData.length > 0) {
        query = query
          .not('id', 'in', `(${highSignalData.map((d) => d.id)})`)
          .not(
            'contract_id',
            'in',
            `(${filterDefined(highSignalData.map((d) => d.contract_id))})`
          )
      }
    }
    const { data: lowerSignalData } = await run(query)
    newFeedRows.push(...lowerSignalData)

    const {
      newContractIds,
      newCommentIds,
      newCommentIdsFromFollowed,
      potentiallySeenCommentIds,
      newsIds,
      groupIds,
    } = getNewContentIds(newFeedRows, savedFeedItems, followedIds)

    const [
      comments,
      commentsFromFollowed,
      contracts,
      news,
      groups,
      uninterestingContractIds,
      seenCommentIds,
    ] = await Promise.all([
      db
        .from('contract_comments')
        .select()
        .in('comment_id', newCommentIds)
        .gt('data->likes', 0)
        .is('data->hidden', null)
        .not('user_id', 'in', `(${privateUser.blockedUserIds})`)
        .then((res) => res.data?.map(convertContractComment)),
      db
        .from('contract_comments')
        .select()
        .in('comment_id', newCommentIdsFromFollowed)
        .then((res) => res.data?.map(convertContractComment)),
      db
        .from('contracts')
        .select('data')
        .in('id', newContractIds)
        .not('visibility', 'eq', 'unlisted')
        .is('resolution_time', null)
        .gt('close_time', new Date().toISOString())
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
        .from('groups')
        .select('data, id')
        .in('id', groupIds)
        .not(
          'slug',
          'in',
          `(${privateUser.blockedGroupSlugs.concat(DEEMPHASIZED_GROUP_SLUGS)})`
        )
        .then((res) =>
          res.data?.map((r) => {
            const data = r.data as Group
            return { ...data, id: r.id } as Group
          })
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
        !uninterestingContractIds?.includes(c.id)
    )
    const filteredNewComments = (comments ?? [])
      .concat(commentsFromFollowed ?? [])
      .filter((c) => !seenCommentIds?.includes(c.id))

    // It's possible we're missing contracts for news items bc of the duplicate filter
    const timelineItems = createFeedTimelineItems(
      newFeedRows,
      filteredNewContracts,
      filteredNewComments,
      news,
      groups
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
    async (options: { old?: boolean; newerThan?: string }) => {
      if (!userId) return []
      const res = await fetchFeedItems(userId, options)
      const { timelineItems } = res
      addTimelineItems(timelineItems, options)
      return timelineItems
    }
  )

  const tryToLoadManyCardsAtStart = useEvent(async () => {
    for (const _ of range(0, 5)) {
      const moreFeedItems = await loadMore({ old: true })
      if (moreFeedItems.length > 5) break
    }
  })

  useEffect(() => {
    if (savedFeedItems?.length || !userId) return
    tryToLoadManyCardsAtStart()
  }, [userId])

  return {
    loadMoreOlder: async () => loadMore({ old: true }),
    checkForNewer: async () =>
      loadMore({
        newerThan: newestCreatedTimestamp.current,
      }),
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
    data: item.data as Record<string, any>,
  } as FeedTimelineItem)

function createFeedTimelineItems(
  data: Row<'user_feed'>[],
  contracts: Contract[] | undefined,
  comments: ContractComment[] | undefined,
  news: News[] | undefined,
  groups: Group[] | undefined
): FeedTimelineItem[] {
  const newsData = Object.entries(
    groupBy(
      data.filter((d) => d.news_id),
      (item) => item.news_id
    )
  ).map(([newsId, newsItems]) => {
    const relevantContracts = contracts?.filter((contract) =>
      newsItems.map((i) => i.contract_id).includes(contract.id)
    )
    const relevantGroups = orderBy(
      groups?.filter((group) =>
        newsItems.map((i) => i.group_id).includes(group.id)
      ),
      (g) => -g.importanceScore
    ).slice(0, 5)

    return {
      ...getBaseTimelineItem(newsItems[0]),
      newsId,
      avatarUrl: relevantContracts?.[0]?.creatorAvatarUrl,
      contracts: relevantContracts,
      groups: relevantGroups,
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
        if (
          !relevantContract ||
          getMarketMovementInfo(
            relevantContract,
            dataType,
            item.data as Record<string, any>
          ).ignore
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

const getNewContentIds = (
  data: Row<'user_feed'>[],
  savedFeedItems: FeedTimelineItem[] | undefined,
  followedIds?: string[]
) => {
  // Filter out already saved ones to reduce bandwidth and avoid duplicates
  const alreadySavedContractIds = filterDefined(
    savedFeedItems?.map((item) => item.contractId) ?? []
  )
  const alreadySavedNewsIds = filterDefined(
    savedFeedItems?.map((item) => item.newsId) ?? []
  )

  const newsIds = filterDefined(
    data
      .filter(
        (item) =>
          item.news_id &&
          item.contract_id &&
          !alreadySavedNewsIds.includes(item.news_id)
      )
      .map((item) => item.news_id)
  )
  const counted = countBy(newsIds)
  const mostImportantNewsId = first(
    sortBy(Object.keys(counted), (newsId) => -counted[newsId])
  )
  const shouldGetNewsRelatedItem = (item: Row<'user_feed'>) =>
    item.news_id ? item.news_id === mostImportantNewsId : true

  const newContractIds = uniq(
    filterDefined(
      data
        .filter(
          (item) =>
            item.contract_id &&
            !alreadySavedContractIds.includes(item.contract_id) &&
            shouldGetNewsRelatedItem(item)
        )
        .map((item) => item.contract_id)
    )
  )
  const newCommentIdsFromFollowed = filterDefined(
    data.map((item) =>
      followedIds?.includes(item.creator_id ?? '_') ? item.comment_id : null
    )
  )
  const newCommentIds = filterDefined(
    data.map((item) =>
      newCommentIdsFromFollowed.includes(item.comment_id ?? '_')
        ? null
        : item.comment_id
    )
  )

  const groupIds = uniq(
    filterDefined(
      data
        .filter((item) => item.group_id && shouldGetNewsRelatedItem(item))
        .map((item) => item.group_id)
    )
  )

  const potentiallySeenCommentIds = uniq(
    filterDefined(data.map((item) => item.comment_id))
  )

  return {
    newContractIds,
    newCommentIds,
    newCommentIdsFromFollowed,
    potentiallySeenCommentIds,
    newsIds: [mostImportantNewsId],
    groupIds,
  }
}
