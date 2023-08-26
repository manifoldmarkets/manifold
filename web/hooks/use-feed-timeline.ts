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
  maxBy,
  minBy,
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

const PAGE_SIZE = 40
const OLDEST_UNSEEN_TIME_OF_INTEREST = new Date(
  Date.now() - 10 * DAY_MS
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
const baseUserFeedQuery = (
  userId: string,
  privateUser: PrivateUser,
  ignoreContractIds: string[],
  limit: number = PAGE_SIZE
) => {
  return (
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
      // New comments or news items with/on contracts we already have on feed are okay
      .or(
        `data_type.eq.new_comment,data_type.eq.news_with_related_contracts,contract_id.not.in.(${ignoreContractIds})`
      )
      .order('created_time', { ascending: false })
      .limit(limit)
  )
}

type loadProps = {
  new?: boolean
  old?: boolean
  signal?: 'high' | 'middle' | 'low'
  ignoreFeedTimelineItems: FeedTimelineItem[]
}
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
  const loadingFirstCards = useRef(false)

  const fetchFeedItems = async (userId: string, options: loadProps) => {
    if (loadingFirstCards.current && options.new) return { timelineItems: [] }

    const ignoreContractIds = filterDefined(
      options.ignoreFeedTimelineItems.map((item) => item.contractId)
    )

    let query = baseUserFeedQuery(userId, privateUser, ignoreContractIds)

    if (options.new) {
      query = query.gt('created_time', newestCreatedTimestamp.current)
    } else if (options.old) {
      query = query
        .gt('created_time', OLDEST_UNSEEN_TIME_OF_INTEREST)
        .lt('created_time', newestCreatedTimestamp.current)
        .is('seen_time', null)

      // Get new trending and probability changed items first
      if (options.signal === 'high') {
        query = query
          .in('data_type', [
            'contract_probability_changed',
            'trending_contract',
          ])
          .or('data->>todayScore.not.is.null,data->>currentProb.not.is.null')
      }
      // Then comments, new markets, or news items
      else if (options.signal === 'middle') {
        query = query.not('data_type', 'eq', 'trending_contract')
      }
      // Low signal gets anything else (old trending, etc.)
    }
    const { data } = await run(query)
    const newFeedRows = data

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
        .gt(
          'ts',
          minBy(newFeedRows, 'created_time')?.created_time ??
            new Date(Date.now() - 5 * DAY_MS).toISOString()
        )
        .then((res) => res.data?.map((c) => c.comment_id)),
    ])
    const openFeedContractIds = (contracts ?? []).map((c) => c.id)
    const closedOrResolvedContractFeedIds = data.filter(
      (d) =>
        d.contract_id &&
        !d.news_id &&
        !openFeedContractIds.includes(d.contract_id)
    )
    // TODO: should we set a discarded field instead of seen_time?
    setSeenFeedItems(closedOrResolvedContractFeedIds)

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
      newFeedItems: FeedTimelineItem[],
      options: { new?: boolean; old?: boolean }
    ) => {
      // Don't signal we're done loading until we've loaded at least one page
      if (
        loadingFirstCards.current &&
        newFeedItems.length === 0 &&
        savedFeedItems === undefined
      )
        return

      const orderedItems = uniqBy(
        options.new
          ? buildArray(newFeedItems, savedFeedItems)
          : buildArray(savedFeedItems, newFeedItems),
        'id'
      )

      // Set the newest timestamp to the most recent item in the feed
      newestCreatedTimestamp.current =
        maxBy(orderedItems, 'createdTime')?.supabaseTimestamp ??
        newestCreatedTimestamp.current

      setSavedFeedItems(orderedItems)
    }
  )
  const loadMore = useEvent(
    async (options: { old?: boolean; new?: boolean }) => {
      if (!userId) return []

      if (options.new) {
        const { timelineItems } = await fetchFeedItems(userId, {
          ...options,
          ignoreFeedTimelineItems: savedFeedItems ?? [],
        })
        addTimelineItems(timelineItems, options)
        return timelineItems
      }

      const items = [] as FeedTimelineItem[]
      for (const signal of ['high', 'middle', 'low'] as const) {
        const { timelineItems } = await fetchFeedItems(userId, {
          ...options,
          signal,
          ignoreFeedTimelineItems: (savedFeedItems ?? []).concat(items),
        })
        addTimelineItems(timelineItems, options)
        items.push(...timelineItems)
      }
      return items
    }
  )

  const tryToLoadManyCardsAtStart = useEvent(async () => {
    loadingFirstCards.current = true
    for (const _ of range(0, 5)) {
      const moreFeedItems = await loadMore({ old: true })
      if (moreFeedItems.length > 10) break
    }
    loadingFirstCards.current = false
  })

  useEffect(() => {
    if (savedFeedItems?.length || !userId) return
    tryToLoadManyCardsAtStart()
  }, [userId])

  return {
    loadMoreOlder: async () => loadMore({ old: true }),
    checkForNewer: async () => loadMore({ new: true }),
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
  const rowsByNewsIdCount = countBy(newsIds)
  const mostImportantNewsId = first(
    sortBy(
      Object.keys(rowsByNewsIdCount),
      (newsId) => -rowsByNewsIdCount[newsId]
    )
  )
  const shouldGetNewsRelatedItem = (item: Row<'user_feed'>) =>
    item.news_id ? item.news_id === mostImportantNewsId : true

  const newContractIds = uniq(
    filterDefined(
      data
        .filter((item) => item.contract_id && shouldGetNewsRelatedItem(item))
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

const setSeenFeedItems = async (feedItems: Row<'user_feed'>[]) => {
  await Promise.all(
    feedItems.map(async (item) =>
      run(
        db
          .from('user_feed')
          .update({ seen_time: new Date().toISOString() })
          .eq('id', item.id)
      )
    )
  )
}
