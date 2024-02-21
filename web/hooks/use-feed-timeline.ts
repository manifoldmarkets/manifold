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
  difference,
  groupBy,
  intersection,
  minBy,
  orderBy,
  range,
  sortBy,
  uniq,
  uniqBy,
} from 'lodash'
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
import { Json } from 'common/supabase/schema'
import { Bet } from 'common/bet'
import { getSeenContractIds } from 'web/lib/supabase/user-events'

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
  betData: PositionChangeData | null
  answerIds: string[] | null
  creatorId: string | null
  seenTime: string | null
  seenDuration: number | null
  postId: number | null
  betId: string | null
  // These are fetched/generated at runtime
  avatarUrl: string | null
  creatorDetails?: CreatorDetails
  contract?: Contract
  contracts?: Contract[]
  comment?: ContractComment
  groups?: Group[]
  answers?: Answer[]
  bet?: Bet
  reasonDescription?: string
  isCopied?: boolean
  data?: Json
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
    // One comment per contract we already have on the feed are okay
    .or(
      `and(data_type.eq.new_comment,contract_id.not.in.(${ignoreContractIdsWithComments})), contract_id.not.in.(${ignoreContractIds})`
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
      query = query.gt(
        'created_time',
        new Date(Date.now() - 7 * DAY_MS).toISOString()
      )
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

  // Note (James): This was noisy so I'm disabling.
  // if (DEBUG_FEED_CARDS)
  //   console.log('DEBUG_FEED_CARDS is true, not marking feed cards as seen')

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
    // TODO: hide feed rows that are too old?
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
      answerIds,
      userIds,
      betIds,
    } = getOnePerCreatorContentIds(newFeedRows, followedIds)

    const [
      likedUnhiddenComments,
      commentsFromFollowed,
      openListedContracts,
      uninterestingContractIds,
      seenCommentIds,
      answers,
      users,
      recentlySeenContractCards,
      bets,
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
      getSeenContractIds(userId, newContractIds, Date.now() - 5 * DAY_MS, [
        'view market card',
      ]),
      db
        .from('contract_bets')
        .select('data')
        .in('bet_id', betIds)
        .then((res) => res.data?.map((b) => b.data as Bet)),
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
    const timelineItems = createFeedTimelineItems(
      newFeedRows,
      freshAndInterestingContracts,
      unseenUnhiddenLikedOrFollowedComments,
      answers,
      bets,
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
  allAnswers: Answer[] | undefined,
  allBets: Bet[] | undefined,
  creators: CreatorDetails[] | undefined
): FeedTimelineItem[] {
  const timelineItems = uniqBy(
    data.map((item) => {
      const contract = contracts?.find(
        (contract) => contract.id === item.contract_id
      )
      // We may not find a relevant contract if they've already seen the same contract in their feed
      if (
        !contract ||
        (item.data_type === 'contract_probability_changed' &&
          getMarketMovementInfo(contract, getBaseTimelineItem(item)).ignore)
      )
        return

      const comment = allComments
        ?.filter(
          (ct) =>
            !ct.content?.content?.some((c) =>
              IGNORE_COMMENT_FEED_CONTENT.includes(c.type ?? '')
            )
        )
        ?.find((comment) => comment.id === item.comment_id)
      if (item.comment_id && !comment) return
      const creatorDetails = creators?.find((u) => u.id === item.creator_id)
      const answers = allAnswers?.filter((a) => item.answer_ids?.includes(a.id))
      const bet = allBets?.find((b) => item.bet_id === b.id)
      return {
        ...getBaseTimelineItem(item),
        avatarUrl: item.comment_id
          ? comment?.userAvatarUrl
          : contract?.creatorAvatarUrl,
        contract,
        comment,
        answers,
        bet,
        creatorDetails,
      } as FeedTimelineItem
    }),
    'contractId'
  )

  const groupedItems = groupItemsBySimilarQuestions(
    filterDefined(timelineItems)
  )

  return sortBy(groupedItems, (i) => -i.relevanceScore)
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
    'new_comment',
    'user_position_changed',
    'repost',
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

  let availableItems = orderBy(
    items,
    (item) => item.contract?.importanceScore ?? 0,
    'desc'
  )

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
        .filter((x) => x.score > 0.6)

      const sortedPotentialMembers = orderBy(
        potentialGroupMembers,
        'score',
        'desc'
      )
      const mostSimilarItems = sortedPotentialMembers
        .slice(0, 5)
        .map((x) => x.relatedItem)
      if (mostSimilarItems.length > 0) {
        item.relatedItems = orderBy(
          mostSimilarItems,
          (item) => item.contract?.importanceScore ?? 0,
          'desc'
        )
        availableItems = availableItems.filter(
          (x) => !mostSimilarItems.includes(x)
        )
      }
    }

    groupedItems.push(item)
  }
  return groupedItems
}

const getOnePerCreatorContentIds = (
  data: Row<'user_feed'>[],
  followedIds?: string[]
) => {
  const contractIdsByCreatorId = groupBy(data, (item) => item.creator_id)
  // Only one contract per creator
  const newContractIds = filterDefined(
    Object.values(contractIdsByCreatorId)
      .map((items) =>
        orderBy(items, (r) => r.relevance_score, 'desc')
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

  const potentiallySeenCommentIds = uniq(
    filterDefined(data.map((item) => item.comment_id))
  )

  const answerIds = uniq(
    filterDefined(data.map((item) => item.answer_ids))
  ).flat()

  // At the moment, we only care about users with bet_ids
  const userIds = uniq(
    filterDefined(data.map((item) => (item.bet_id ? item.creator_id : null)))
  )

  const betIds = uniq(filterDefined(data.map((item) => item.bet_id)))

  return {
    newContractIds,
    newCommentIds,
    newCommentIdsFromFollowed,
    potentiallySeenCommentIds,
    answerIds,
    userIds,
    betIds,
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
