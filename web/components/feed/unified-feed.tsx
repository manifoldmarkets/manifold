import clsx from 'clsx'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { groupBy, keyBy, orderBy, uniqBy } from 'lodash'

import { APIResponse } from 'common/api/schema'
import { Bet } from 'common/bet'
import { CommentWithTotalReplies } from 'common/comment'
import { Contract } from 'common/contract'
import { Repost } from 'common/repost'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { useEvent } from 'client-common/hooks/use-event'
import { Col } from 'web/components/layout/col'
import { LoadingCards } from 'web/components/contract/feed-contract-card'
import { VisibilityObserver } from 'web/components/widgets/visibility-observer'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { api } from 'web/lib/api/api'
import { UnifiedFeedCard } from './unified-feed-card'
import { ActivityCard, ActivityGroup, ActivityItem } from './activity-card'

type FeedData = {
  contracts: Contract[]
  comments: CommentWithTotalReplies[]
  bets: Bet[]
  reposts: Repost[]
  idsToReason: Record<string, string>
  feedOffset: number
}

type ActivityData = {
  bets: Bet[]
  comments: CommentWithTotalReplies[]
  newContracts: Contract[]
  relatedContracts: Contract[]
  activityOffset: number
}

// A feed item can be either a personalized contract card or an activity group
type FeedItem =
  | { type: 'contract'; contract: Contract; repost?: Repost; comment?: CommentWithTotalReplies; bet?: Bet; reason?: string; time: number }
  | { type: 'activity'; group: ActivityGroup; time: number }

const defaultFeedData: FeedData = {
  contracts: [],
  comments: [],
  bets: [],
  reposts: [],
  idsToReason: {},
  feedOffset: 0,
}

const defaultActivityData: ActivityData = {
  bets: [],
  comments: [],
  newContracts: [],
  relatedContracts: [],
  activityOffset: 0,
}

export function UnifiedFeed(props: { className?: string }) {
  const { className } = props
  const user = useUser()
  const privateUser = usePrivateUser()
  const isLoggedIn = !!user

  const feedLimit = 5
  const activityLimit = 10

  // Feed data (personalized or trending contracts)
  const [feedData, setFeedData] = usePersistentInMemoryState<FeedData>(
    defaultFeedData,
    `unified-feed-data-v2-${user?.id ?? 'logged-out'}`
  )

  // Activity data (global site activity)
  const [activityData, setActivityData] = usePersistentInMemoryState<ActivityData>(
    defaultActivityData,
    `unified-activity-data-v2-${user?.id ?? 'logged-out'}`
  )

  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(
    feedData.contracts.length === 0 && activityData.bets.length === 0
  )

  const blockedGroupSlugs = privateUser?.blockedGroupSlugs ?? []
  const blockedContractIds = privateUser?.blockedContractIds ?? []
  const blockedUserIds = privateUser?.blockedUserIds ?? []

  // Fetch personalized feed OR trending contracts
  const fetchFeed = useEvent(async () => {
    try {
      if (isLoggedIn && user) {
        const data = await api('get-feed', {
          userId: user.id,
          offset: feedData.feedOffset,
          limit: feedLimit,
          ignoreContractIds: feedData.contracts.map((c) => c.id),
        })

        setFeedData((prev) => ({
          contracts: uniqBy([...prev.contracts, ...data.contracts], 'id'),
          comments: uniqBy([...prev.comments, ...data.comments], 'id'),
          bets: uniqBy([...prev.bets, ...data.bets], 'id'),
          reposts: uniqBy([...prev.reposts, ...data.reposts], 'id'),
          idsToReason: { ...prev.idsToReason, ...data.idsToReason },
          feedOffset: prev.feedOffset + feedLimit,
        }))
      } else {
        const contracts = await api('search-markets-full', {
          term: '',
          filter: 'open',
          sort: 'score',
          limit: feedLimit,
          offset: feedData.feedOffset,
        })

        setFeedData((prev) => ({
          ...prev,
          contracts: uniqBy([...prev.contracts, ...contracts], 'id'),
          feedOffset: prev.feedOffset + feedLimit,
        }))
      }
    } catch (e) {
      console.error('Error fetching feed:', e)
    }
  })

  // Fetch global site activity
  const fetchActivity = useEvent(async () => {
    try {
      const existingContractIds = [
        ...feedData.contracts.map((c) => c.id),
        ...activityData.relatedContracts.map((c) => c.id),
      ]

      const data = await api('get-site-activity', {
        limit: activityLimit,
        offset: activityData.activityOffset,
        types: ['bets', 'comments', 'markets'],
        blockedUserIds,
        blockedGroupSlugs,
        blockedContractIds: [...blockedContractIds, ...existingContractIds],
        minBetAmount: 100, // Only show notable bets
      })

      setActivityData((prev) => ({
        bets: uniqBy([...prev.bets, ...data.bets], 'id'),
        comments: uniqBy([...prev.comments, ...data.comments], 'id'),
        newContracts: uniqBy([...prev.newContracts, ...data.newContracts], 'id'),
        relatedContracts: uniqBy([...prev.relatedContracts, ...data.relatedContracts], 'id'),
        activityOffset: prev.activityOffset + activityLimit,
      }))
    } catch (e) {
      console.error('Error fetching activity:', e)
    }
  })

  // Fetch both in parallel
  const fetchMore = useEvent(async () => {
    if (loading) return
    setLoading(true)

    await Promise.all([fetchFeed(), fetchActivity()])

    setLoading(false)
    setInitialLoading(false)
  })

  // Initial fetch
  useEffect(() => {
    if (feedData.contracts.length === 0 && activityData.bets.length === 0) {
      fetchMore()
    }
  }, [user?.id])

  // Build unified feed items
  const feedItems = buildUnifiedFeed(feedData, activityData)

  if (initialLoading) {
    return <LoadingCards />
  }

  return (
    <Col className={clsx('relative w-full gap-4', className)}>
      {feedItems.map((item, index) => {
        if (item.type === 'contract') {
          return (
            <UnifiedFeedCard
              key={`contract-${item.contract.id}-${index}`}
              contract={item.contract}
              repost={item.repost}
              comment={item.comment}
              bet={item.bet}
              user={user}
              reason={item.reason ?? ''}
            />
          )
        } else {
          return (
            <ActivityCard
              key={`activity-${item.group.contractId}-${index}`}
              group={item.group}
              user={user}
            />
          )
        }
      })}

      <div className="relative">
        {loading && <LoadingCards rows={1} />}
        <VisibilityObserver
          className="pointer-events-none absolute bottom-0 h-screen w-full select-none"
          onVisibilityUpdated={(visible) => {
            if (visible && !loading) {
              fetchMore()
            }
          }}
        />
      </div>

      {feedItems.length === 0 && !loading && (
        <div className="text-ink-1000 m-4 flex w-full flex-col items-center justify-center">
          <div>No activity found.</div>
          <br />
          <Link href="/home" className="text-primary-700 hover:underline">
            Browse new questions
          </Link>
          <Link href="/create" className="text-primary-700 hover:underline">
            Create a market
          </Link>
        </div>
      )}
    </Col>
  )
}

function buildUnifiedFeed(feedData: FeedData, activityData: ActivityData): FeedItem[] {
  const feedItems: FeedItem[] = []
  const activityFeedItems: FeedItem[] = []
  const seenContractIds = new Set<string>()

  // Build personalized contract cards
  for (const contract of feedData.contracts) {
    if (seenContractIds.has(contract.id)) continue
    seenContractIds.add(contract.id)

    const repost = feedData.reposts.find((r) => r.contract_id === contract.id)
    const comment = feedData.comments.find((c) => c.contractId === contract.id)
    const bet = feedData.bets.find((b) => b.contractId === contract.id)
    const reason = feedData.idsToReason[contract.id]

    const time = Math.max(
      contract.createdTime,
      repost?.created_time ? new Date(repost.created_time).getTime() : 0,
      comment?.createdTime ?? 0,
      bet?.createdTime ?? 0
    )

    feedItems.push({
      type: 'contract',
      contract,
      repost,
      comment,
      bet,
      reason,
      time,
    })
  }

  // Build activity groups from global activity
  const activityContracts = [
    ...activityData.newContracts,
    ...activityData.relatedContracts,
  ]
  const contractsById = keyBy(activityContracts, 'id')

  // Convert activity data to ActivityItems
  const activityItems: ActivityItem[] = []

  for (const bet of activityData.bets) {
    if (seenContractIds.has(bet.contractId)) continue
    activityItems.push({
      type: 'bet',
      id: bet.id,
      contractId: bet.contractId,
      createdTime: bet.createdTime,
      data: bet,
    })
  }

  for (const comment of activityData.comments) {
    if (seenContractIds.has(comment.contractId)) continue
    activityItems.push({
      type: 'comment',
      id: comment.id,
      contractId: comment.contractId,
      createdTime: comment.createdTime,
      data: comment,
    })
  }

  for (const contract of activityData.newContracts) {
    if (seenContractIds.has(contract.id)) continue
    activityItems.push({
      type: 'market',
      id: contract.id,
      contractId: contract.id,
      createdTime: contract.createdTime,
      data: contract,
    })
  }

  // Group activity items by contract
  const groupedActivity = groupBy(activityItems, 'contractId')

  for (const [contractId, groupItems] of Object.entries(groupedActivity)) {
    if (seenContractIds.has(contractId)) continue

    const contract = contractsById[contractId]
    if (!contract) continue

    seenContractIds.add(contractId)

    const latestTime = Math.max(...groupItems.map((item) => item.createdTime))

    activityFeedItems.push({
      type: 'activity',
      group: {
        contractId,
        contract,
        items: groupItems,
        latestTime,
      },
      time: latestTime,
    })
  }

  // Alternate between feed items and activity items
  // This ensures a good mix rather than all activity at top
  const result: FeedItem[] = []
  const maxLen = Math.max(feedItems.length, activityFeedItems.length)

  for (let i = 0; i < maxLen; i++) {
    // Add a feed item first (personalized content)
    if (i < feedItems.length) {
      result.push(feedItems[i])
    }
    // Then add an activity item
    if (i < activityFeedItems.length) {
      result.push(activityFeedItems[i])
    }
  }

  return result
}
