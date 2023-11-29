import { Contract } from 'common/contract'
import { PrivateUser, User } from 'common/user'
import { ContractComment } from 'common/comment'
import { useEffect, useRef } from 'react'
import { buildArray, filterDefined } from 'common/util/array'
import { useEvent } from './use-event'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'
import { convertSQLtoTS, Row, run, tsToMillis } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'
import {
  countBy,
  difference,
  first,
  groupBy,
  intersection,
  minBy,
  orderBy,
  range,
  sortBy,
  uniq,
  uniqBy,
} from 'lodash'
import { News } from 'common/news'
import {
  BASE_FEED_DATA_TYPE_SCORES,
  CreatorDetails,
  FEED_DATA_TYPES,
  FEED_REASON_TYPES,
  getExplanation,
} from 'common/feed'
import { isContractBlocked } from 'web/lib/firebase/users'
import { IGNORE_COMMENT_FEED_CONTENT } from 'web/hooks/use-additional-feed-items'
import { DAY_MS } from 'common/util/time'
import { Group } from 'common/group'
import { getMarketMovementInfo } from 'web/lib/supabase/feed-timeline/feed-market-movement-display'
import { useFollowedIdsSupabase } from 'web/hooks/use-follows'
import { PositionChangeData } from 'common/supabase/bets'
import { Answer } from 'common/answer'
import { removeUndefinedProps } from 'common/util/object'
import { convertAnswer, convertContract } from 'common/supabase/contracts'
import { compareTwoStrings } from 'string-similarity'
import dayjs from 'dayjs'
import { useBoosts } from 'web/hooks/use-boosts'
import { useIsAuthorized } from 'web/hooks/use-user'
import { convertContractComment } from 'common/supabase/comments'

export const DEBUG_FEED_CARDS =
  typeof window != 'undefined' &&
  window.location.toString().includes('localhost:3000')
const MAX_ITEMS_PER_CREATOR = 7

export type FeedTimelineItem = {
  // These are stored in the db
  id: number
  dataType: FEED_DATA_TYPES
  reason: FEED_REASON_TYPES
  reasons: FEED_REASON_TYPES[] | null
  createdTime: number
  supabaseTimestamp: string
  relevanceScore: number
  contractId: string | null
  commentId: string | null
  newsId: string | null
  betData: PositionChangeData | null
  answerIds: string[] | null
  creatorId: string | null
  seenTime: string | null
  seenDuration: number | null
  // These are fetched/generated at runtime
  avatarUrl: string | null
  creatorDetails?: CreatorDetails
  contract?: Contract
  contracts?: Contract[]
  comments?: ContractComment[]
  groups?: Group[]
  news?: News
  answers?: Answer[]
  reasonDescription?: string
  isCopied?: boolean
  data?: Record<string, any>
  manuallyCreatedFromContract?: boolean
  relatedItems?: FeedTimelineItem[]
}
type times = 'new' | 'old'
type loadProps = {
  time: times
  ignoreFeedTimelineItems: FeedTimelineItem[]
  allowSeen?: boolean
}
const baseQuery = (
  userId: string,
  privateUser: PrivateUser,
  ignoreContractIds: string[],
  ignoreContractIdsWithComments: string[],
  limit: number
) =>
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
    // One comment per contract or news items with contracts we already have on the feed are okay
    .or(
      `and(data_type.eq.new_comment,contract_id.not.in.(${ignoreContractIdsWithComments})), data_type.eq.news_with_related_contracts, contract_id.not.in.(${ignoreContractIds})`
    )
    .order('relevance_score', { ascending: false })
    .limit(limit)

const queryForFeedRows = async (
  userId: string,
  privateUser: PrivateUser,
  options: loadProps,
  newestCreatedTimestamp: string
) => {
  const currentlyFetchedContractIds = filterDefined(
    options.ignoreFeedTimelineItems
      .map((item) =>
        (item.relatedItems ?? [])
          .map((c) => c.contractId)
          .concat([item.contractId])
      )
      .flat()
  )
  const currentlyFetchedCommentItems = filterDefined(
    options.ignoreFeedTimelineItems.map((item) =>
      item.commentId ? item.contractId : null
    )
  )

  let query = baseQuery(
    userId,
    privateUser,
    currentlyFetchedContractIds,
    currentlyFetchedCommentItems,
    100
  )
  if (options.time === 'new') {
    query = query.gt('created_time', newestCreatedTimestamp)
  } else if (options.time === 'old') {
    query = query.lt('created_time', newestCreatedTimestamp)
    if (options.allowSeen) {
      // We don't want the same top cards over and over when we've run out of new cards,
      // instead it should be the most recently seen items first
      query = query.order('seen_time', { ascending: false })
    } else {
      query = query.is('seen_time', null)
    }
  }
  const results = await query
  return filterDefined(results.data?.map((d) => d as Row<'user_feed'>) ?? [])
}
export const useFeedTimeline = (
  user: User | null | undefined,
  privateUser: PrivateUser,
  key: string
) => {
  const isAuthed = useIsAuthorized()
  const boosts = useBoosts(privateUser, key)
  const followedIds = useFollowedIdsSupabase(privateUser.id)
  if (DEBUG_FEED_CARDS)
    console.log('DEBUG_FEED_CARDS is true, not marking feed cards as seen')

  const [savedFeedItems, setSavedFeedItems] = usePersistentInMemoryState<
    FeedTimelineItem[] | undefined
  >(undefined, `timeline-items-${user?.id}-${key}`)

  const userId = user?.id
  // Supabase timestamptz has more precision than js Date, so we need to store the oldest and newest timestamps as strings
  const newestCreatedTimestamp = useRef(new Date().toISOString())
  const loadingFirstCards = useRef(false)

  const fetchFeedItems = async (userId: string, options: loadProps) => {
    if (loadingFirstCards.current && options.time === 'new')
      return { timelineItems: [] }

    const data = await queryForFeedRows(
      userId,
      privateUser,
      options,
      newestCreatedTimestamp.current
    )

    if (data.length == 0) {
      return { timelineItems: [] }
    }

    const newFeedRows = data.map((d) => {
      const createdTimeAdjusted =
        1 - dayjs().diff(dayjs(d.created_time), 'day') / 10
      d.relevance_score =
        (d.relevance_score ||
          BASE_FEED_DATA_TYPE_SCORES[d.data_type as FEED_DATA_TYPES]) *
        createdTimeAdjusted
      return d
    })
    const {
      newContractIds,
      newCommentIds,
      newCommentIdsFromFollowed,
      potentiallySeenCommentIds,
      newsIds,
      groupIds,
      answerIds,
      userIds,
    } = getNewContentIds(newFeedRows, savedFeedItems, followedIds)

    const [
      likedUnhiddenComments,
      commentsFromFollowed,
      openListedContracts,
      news,
      groups,
      uninterestingContractIds,
      seenCommentIds,
      answers,
      users,
      recentlySeenContractCards,
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
        .is('data->hidden', null)
        .in('comment_id', newCommentIdsFromFollowed)
        .then((res) => res.data?.map(convertContractComment)),
      db
        .from('contracts')
        .select('data, importance_score')
        .in('id', newContractIds)
        .not('visibility', 'eq', 'unlisted')
        .is('resolution_time', null)
        .or(`close_time.gt.${new Date().toISOString()},close_time.is.null`)
        .then((res) => res.data?.map(convertContract)),
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
      db
        .from('answers')
        .select('*')
        .in('id', answerIds)
        .then((res) => res.data?.map((a) => convertAnswer(a))),
      db
        .from('users')
        .select('id, data, name, username')
        .in('id', userIds)
        .then((res) =>
          res.data?.map(
            (u) =>
              ({
                id: u.id,
                name: u.name,
                username: u.username,
                avatarUrl: (u.data as User).avatarUrl,
              } as CreatorDetails)
          )
        ),
      db
        .from('user_seen_markets')
        .select('contract_id')
        .eq('user_id', userId)
        .in('type', ['view market card']) // Could add 'view market' as well
        .in('contract_id', newContractIds)
        .gt('created_time', new Date(Date.now() - 3 * DAY_MS).toISOString())
        .then((res) => res.data?.map((c) => c.contract_id)),
    ])

    const feedItemRecentlySeen = (d: Row<'user_feed'>) =>
      d.contract_id &&
      // Types to ignore if seen recently:
      [
        'new_subsidy',
        'trending_contract',
        'user_position_changed',
        'new_contract',
        'new_comment',
      ].includes(d.data_type) &&
      recentlySeenContractCards?.includes(d.contract_id)

    const recentlySeenFeedContractIds = uniq(
      newFeedRows
        .filter((r) => feedItemRecentlySeen(r))
        .map((r) => r.contract_id)
    )

    const freshAndInterestingContracts = openListedContracts?.filter(
      (c) =>
        !isContractBlocked(privateUser, c) &&
        !uninterestingContractIds?.includes(c.id) &&
        !recentlySeenFeedContractIds.includes(c.id)
    )

    const unseenUnhiddenLikedOrFollowedComments = (likedUnhiddenComments ?? [])
      .concat(commentsFromFollowed ?? [])
      .filter((c) => !seenCommentIds?.includes(c.id))

    // We could set comment feed rows with insufficient likes as seen here, settling for seen ones only
    const commentFeedIdsToIgnore = newFeedRows.filter((r) =>
      r.comment_id ? seenCommentIds?.includes(r.comment_id ?? '_') : false
    )
    const contractFeedIdsToIgnore = newFeedRows.filter(
      (d) =>
        d.contract_id &&
        newContractIds.includes(d.contract_id) &&
        !(freshAndInterestingContracts ?? [])
          .map((c) => c.id)
          .includes(d.contract_id)
    )

    setSeenFeedItems(contractFeedIdsToIgnore.concat(commentFeedIdsToIgnore))

    // It's possible we're missing contracts for news items bc of the duplicate filter
    const timelineItems = createFeedTimelineItems(
      newFeedRows,
      freshAndInterestingContracts,
      unseenUnhiddenLikedOrFollowedComments,
      news,
      groups,
      answers,
      users
    )
    return { timelineItems }
  }

  const addTimelineItems = useEvent(
    (newFeedItems: FeedTimelineItem[], options: { time: times }) => {
      // Don't signal we're done loading until we've loaded at least one page
      if (
        loadingFirstCards.current &&
        newFeedItems.length === 0 &&
        savedFeedItems === undefined
      )
        return

      const orderedItems = uniqBy(
        options.time === 'new'
          ? buildArray(newFeedItems, savedFeedItems)
          : buildArray(savedFeedItems, newFeedItems),
        'id'
      )

      setSavedFeedItems(orderedItems)
    }
  )
  const loadMore = useEvent(
    async (options: { time: times; allowSeen?: boolean }) => {
      if (!userId) return []

      const { timelineItems } = await fetchFeedItems(userId, {
        ...options,
        ignoreFeedTimelineItems: savedFeedItems ?? [],
      })
      addTimelineItems(timelineItems, options)
      return timelineItems
    }
  )

  const tryToLoadManyCardsAtStart = useEvent(async () => {
    loadingFirstCards.current = true
    for (const i of range(0, 5)) {
      const moreFeedItems = await loadMore({ time: 'old' })
      if (moreFeedItems.length > 10) break
      if (i === 4) await loadMore({ time: 'old', allowSeen: true })
    }
    loadingFirstCards.current = false
  })

  useEffect(() => {
    if (savedFeedItems?.length || !userId || !isAuthed) return
    tryToLoadManyCardsAtStart()
  }, [userId, isAuthed])

  return {
    loadMoreOlder: async (allowSeen: boolean) =>
      loadMore({ time: 'old', allowSeen }),
    checkForNewer: async () => loadMore({ time: 'new' }),
    addTimelineItems,
    boosts: boosts?.filter(
      (b) =>
        !(savedFeedItems?.map((f) => f.contractId) ?? []).includes(b.market_id)
    ),
    savedFeedItems,
  }
}

const getBaseTimelineItem = (item: Row<'user_feed'>) =>
  removeUndefinedProps({
    ...convertSQLtoTS<'user_feed', FeedTimelineItem>(
      item,
      {
        created_time: (ts) => tsToMillis(ts),
      },
      false
    ),
    data: item.data,
    supabaseTimestamp: item.created_time,
    reasonDescription: getExplanation(
      item.data_type as FEED_DATA_TYPES,
      item.reason as FEED_REASON_TYPES
    ),
  })

function createFeedTimelineItems(
  data: Row<'user_feed'>[],
  contracts: Contract[] | undefined,
  allComments: ContractComment[] | undefined,
  news: News[] | undefined,
  groups: Group[] | undefined,
  allAnswers: Answer[] | undefined,
  creators: CreatorDetails[] | undefined
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
        const contract = contracts?.find(
          (contract) => contract.id === item.contract_id
        )
        // We may not find a relevant contract if they've already seen the same contract in their feed
        if (
          !contract ||
          getMarketMovementInfo(
            contract,
            dataType,
            item.data as Record<string, any>
          ).ignore
        )
          return
        if (item.data_type === 'contract_probability_changed')
          console.log(
            'prob change',
            contract.question,
            getMarketMovementInfo(
              contract,
              dataType,
              item.data as Record<string, any>
            ).probChange
          )

        // Let's stick with one comment per feed item for now
        const comments = allComments
          ?.filter((comment) => comment.id === item.comment_id)
          .filter(
            (ct) =>
              !ct.content?.content?.some((c) =>
                IGNORE_COMMENT_FEED_CONTENT.includes(c.type ?? '')
              )
          )
        if (item.comment_id && !comments?.length) return
        const creatorDetails = creators?.find((u) => u.id === item.creator_id)
        const answers = allAnswers?.filter((a) =>
          item.answer_ids?.includes(a.id)
        )

        return {
          ...getBaseTimelineItem(item),
          avatarUrl: item.comment_id
            ? comments?.[0]?.userAvatarUrl
            : contract?.creatorAvatarUrl,
          contract,
          comments,
          answers,
          creatorDetails,
        } as FeedTimelineItem
      }),
    'contractId'
  )

  const groupedItems = groupItemsBySimilarQuestions(
    filterDefined(nonNewsTimelineItems)
  )

  return sortBy([...newsData, ...groupedItems], (i) => -i.relevanceScore)
}

const groupItemsBySimilarQuestions = (items: FeedTimelineItem[]) => {
  const groupedItems: FeedTimelineItem[] = []
  const wordsToFilter = ['will', '?', 'by', 'the']
  const cleanQuestion = (question: string | undefined) =>
    (question ?? '')
      .split(' ')
      .filter((word) => !wordsToFilter.includes(word.toLowerCase()))
      .join(' ')

  const soloDataTypes: FEED_DATA_TYPES[] = [
    'contract_probability_changed',
    'news_with_related_contracts',
    'new_comment',
    'user_position_changed',
  ]

  const compareSlugs = (s1: string[], s2: string[]) => {
    const sharedGroups = intersection(s1, s2).length

    const uniqueToS1 = difference(s1, s2).length
    const uniqueToS2 = difference(s2, s1).length

    const totalUnique = uniqueToS1 + uniqueToS2
    const totalGroupSlugs = sharedGroups + totalUnique

    if (totalGroupSlugs === 0) return 0
    // We could subtract the totalUniques if we're grouping too many dissimilar contracts
    return sharedGroups / (totalGroupSlugs * 5)
  }

  let availableItems = [...items]
  while (availableItems.length > 0) {
    // Remove this item from the available items
    const item = availableItems.shift()
    if (!item) break
    if (!soloDataTypes.includes(item.dataType)) {
      const potentialGroupMembers = availableItems
        .map((relatedItem) => ({
          relatedItem,
          score: soloDataTypes.includes(relatedItem.dataType)
            ? 0
            : compareTwoStrings(
                cleanQuestion(item.contract?.question),
                cleanQuestion(relatedItem.contract?.question)
              ) +
              compareSlugs(
                item.contract?.groupSlugs ?? [],
                relatedItem.contract?.groupSlugs ?? []
              ),
        }))
        .filter((x) => x.score > 0.5)

      const sortedPotentialMembers = orderBy(
        potentialGroupMembers,
        'score',
        'desc'
      )
      const mostSimilarItems = sortedPotentialMembers
        .slice(0, 5)
        .map((x) => x.relatedItem)
      if (mostSimilarItems.length > 0) {
        item.relatedItems = mostSimilarItems
        availableItems = availableItems.filter(
          (x) => !mostSimilarItems.includes(x)
        )
      }
    }

    groupedItems.push(item)
  }
  return groupedItems
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

  const contractIdsByCreatorId = groupBy(data, (item) => item.creator_id)
  const newContractIds = filterDefined(
    Object.values(contractIdsByCreatorId)
      .map((items) =>
        items
          .filter((item) => item.contract_id && shouldGetNewsRelatedItem(item))
          .slice(0, MAX_ITEMS_PER_CREATOR)
          .map((item) => item.contract_id)
      )
      .flat()
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

  const answerIds = uniq(
    filterDefined(data.map((item) => item.answer_ids))
  ).flat()
  // At the moment, we only care about users with bet_data
  const userIds = uniq(
    filterDefined(data.map((item) => (item.bet_data ? item.creator_id : null)))
  )

  return {
    newContractIds,
    newCommentIds,
    newCommentIdsFromFollowed,
    potentiallySeenCommentIds,
    newsIds: filterDefined([mostImportantNewsId]),
    groupIds,
    answerIds,
    userIds,
  }
}

const setSeenFeedItems = async (feedItems: Row<'user_feed'>[]) => {
  if (DEBUG_FEED_CARDS) return
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
