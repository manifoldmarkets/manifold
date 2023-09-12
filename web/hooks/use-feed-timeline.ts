import { Contract } from 'common/contract'
import { PrivateUser, User } from 'common/user'
import { ContractComment } from 'common/comment'
import { useEffect, useRef } from 'react'
import { buildArray, filterDefined } from 'common/util/array'
import { useEvent } from './use-event'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'
import { mapTypes, Row, run, tsToMillis } from 'common/supabase/utils'
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
import { convertContractComment } from 'web/lib/supabase/comments'
import { Group } from 'common/group'
import { getMarketMovementInfo } from 'web/lib/supabase/feed-timeline/feed-market-movement-display'
import { useFollowedIdsSupabase } from 'web/hooks/use-follows'
import { PositionChangeData } from 'common/supabase/bets'
import { Answer } from 'common/answer'
import { removeUndefinedProps } from 'common/util/object'
import { convertAnswer } from 'common/supabase/contracts'
import { compareTwoStrings } from 'string-similarity'
import dayjs from 'dayjs'
import { useBoosts } from 'web/hooks/use-boosts'

export const DEBUG_FEED_CARDS =
  typeof window != 'undefined' &&
  window.location.toString().includes('localhost:3000')
const PAGE_SIZE = 50

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
const baseUserFeedQuery = (
  userId: string,
  privateUser: PrivateUser,
  ignoreContractIds: string[]
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
      .order('relevance_score', { ascending: false })
      .limit(PAGE_SIZE)
  )
}

type loadProps = {
  new?: boolean
  old?: boolean
  ignoreFeedTimelineItems: FeedTimelineItem[]
}
export const useFeedTimeline = (
  user: User | null | undefined,
  privateUser: PrivateUser,
  key: string
) => {
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
    if (loadingFirstCards.current && options.new) return { timelineItems: [] }

    const ignoreContractIds = filterDefined(
      options.ignoreFeedTimelineItems
        .map((item) =>
          (item.relatedItems ?? [])
            .map((c) => c.contractId)
            .concat([item.contractId])
        )
        .flat()
    )

    let query = baseUserFeedQuery(userId, privateUser, ignoreContractIds)

    if (options.new) {
      query = query.gt('created_time', newestCreatedTimestamp.current)
    } else if (options.old) {
      query = query
        .lt('created_time', newestCreatedTimestamp.current)
        .is('seen_time', null)
    }
    const { data } = await run(query)

    const newFeedRows = data.map((d) => {
      const createdTimeAdjusted =
        1 - dayjs().diff(dayjs(d.created_time), 'day') / 20
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
      comments,
      commentsFromFollowed,
      contracts,
      news,
      groups,
      uninterestingContractIds,
      seenCommentIds,
      answers,
      users,
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
        .select('data, importance_score')
        .in('id', newContractIds)
        .not('visibility', 'eq', 'unlisted')
        .is('resolution_time', null)
        .gt('close_time', new Date().toISOString())
        .then((res) =>
          res.data?.map(
            (c) =>
              ({
                ...(c.data as Contract),
                // importance_score is only updated in Supabase
                importanceScore: c.importance_score,
              } as Contract)
          )
        ),
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
    ])
    const openFeedContractIds = (contracts ?? []).map((c) => c.id)
    const closedOrResolvedContractFeedIds = newFeedRows.filter(
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
      groups,
      answers,
      users
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

      setSavedFeedItems(orderedItems)
    }
  )
  const loadMore = useEvent(
    async (options: { old?: boolean; new?: boolean }) => {
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
  removeUndefinedProps({
    ...mapTypes<'user_feed', FeedTimelineItem>(item, {
      created_time: (ts) => tsToMillis(ts),
    }),
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
    newsIds: [mostImportantNewsId],
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
