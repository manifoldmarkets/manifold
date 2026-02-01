import clsx from 'clsx'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { groupBy, keyBy, orderBy, uniqBy } from 'lodash'

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

type UnifiedFeedData = {
  // Personalized feed
  contracts: Contract[]
  comments: CommentWithTotalReplies[]
  bets: Bet[]
  reposts: Repost[]
  idsToReason: Record<string, string>
  // Boosted markets
  boostedContracts: Contract[]
  // Activity
  activityBets: Bet[]
  activityComments: CommentWithTotalReplies[]
  activityNewContracts: Contract[]
  activityRelatedContracts: Contract[]
  // Offsets
  feedOffset: number
  activityOffset: number
}

// A feed item can be either a personalized contract card or an activity group
type FeedItem =
  | {
      type: 'contract'
      contract: Contract
      repost?: Repost
      comment?: CommentWithTotalReplies
      bet?: Bet
      reason?: string
      time: number
    }
  | { type: 'activity'; group: ActivityGroup; time: number }

const defaultFeedData: UnifiedFeedData = {
  contracts: [],
  comments: [],
  bets: [],
  reposts: [],
  idsToReason: {},
  boostedContracts: [],
  activityBets: [],
  activityComments: [],
  activityNewContracts: [],
  activityRelatedContracts: [],
  feedOffset: 0,
  activityOffset: 0,
}

export function UnifiedFeed(props: { className?: string }) {
  const { className } = props
  const user = useUser()
  const privateUser = usePrivateUser()

  const feedLimit = 5
  const activityLimit = 10

  const [feedData, setFeedData] = usePersistentInMemoryState<UnifiedFeedData>(
    defaultFeedData,
    `unified-feed-data-v4-${user?.id ?? 'logged-out'}`
  )

  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(
    feedData.contracts.length === 0 && feedData.activityBets.length === 0
  )

  const blockedGroupSlugs = privateUser?.blockedGroupSlugs ?? []
  const blockedContractIds = privateUser?.blockedContractIds ?? []
  const blockedUserIds = privateUser?.blockedUserIds ?? []

  // Single unified API call for both feed and activity
  const fetchMore = useEvent(async () => {
    if (loading) return
    setLoading(true)

    try {
      const existingContractIds = [
        ...feedData.contracts.map((c) => c.id),
        ...feedData.activityRelatedContracts.map((c) => c.id),
      ]

      const data = await api('get-unified-feed', {
        userId: user?.id,
        feedLimit,
        feedOffset: feedData.feedOffset,
        activityLimit,
        activityOffset: feedData.activityOffset,
        ignoreContractIds: existingContractIds,
        blockedUserIds,
        blockedGroupSlugs,
        blockedContractIds,
        minBetAmount: 100,
      })

      // Add 'boosted' reason for boosted contracts
      const boostedReasons = Object.fromEntries(
        data.boostedContracts.map((c) => [c.id, 'boosted'])
      )

      setFeedData((prev) => ({
        contracts: uniqBy([...prev.contracts, ...data.contracts], 'id'),
        comments: uniqBy([...prev.comments, ...data.comments], 'id'),
        bets: uniqBy([...prev.bets, ...data.bets], 'id'),
        reposts: uniqBy([...prev.reposts, ...data.reposts], 'id'),
        idsToReason: {
          ...prev.idsToReason,
          ...data.idsToReason,
          ...boostedReasons,
        },
        boostedContracts: uniqBy(
          [...prev.boostedContracts, ...data.boostedContracts],
          'id'
        ),
        activityBets: uniqBy(
          [...prev.activityBets, ...data.activityBets],
          'id'
        ),
        activityComments: uniqBy(
          [...prev.activityComments, ...data.activityComments],
          'id'
        ),
        activityNewContracts: uniqBy(
          [...prev.activityNewContracts, ...data.activityNewContracts],
          'id'
        ),
        activityRelatedContracts: uniqBy(
          [...prev.activityRelatedContracts, ...data.activityRelatedContracts],
          'id'
        ),
        feedOffset: prev.feedOffset + feedLimit,
        activityOffset: prev.activityOffset + activityLimit,
      }))
    } catch (e) {
      console.error('Error fetching unified feed:', e)
    } finally {
      setLoading(false)
      setInitialLoading(false)
    }
  })

  // Initial fetch
  useEffect(() => {
    if (feedData.contracts.length === 0 && feedData.activityBets.length === 0) {
      fetchMore()
    }
  }, [user?.id])

  // Build unified feed items
  const feedItems = buildUnifiedFeed(feedData)

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

function buildUnifiedFeed(feedData: UnifiedFeedData): FeedItem[] {
  const boostedItems: FeedItem[] = []
  const feedItems: FeedItem[] = []
  const activityFeedItems: FeedItem[] = []
  const seenContractIds = new Set<string>()

  // Build boosted contract cards first (they appear at top)
  for (const contract of feedData.boostedContracts) {
    if (seenContractIds.has(contract.id)) continue
    seenContractIds.add(contract.id)

    boostedItems.push({
      type: 'contract',
      contract,
      reason: 'boosted',
      time: Date.now(), // Boosted items stay at top
    })
  }

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
    ...feedData.activityNewContracts,
    ...feedData.activityRelatedContracts,
  ]
  const contractsById = keyBy(activityContracts, 'id')

  // Convert activity data to ActivityItems
  const activityItems: ActivityItem[] = []

  for (const bet of feedData.activityBets) {
    if (seenContractIds.has(bet.contractId)) continue
    activityItems.push({
      type: 'bet',
      id: bet.id,
      contractId: bet.contractId,
      createdTime: bet.createdTime,
      data: bet,
    })
  }

  for (const comment of feedData.activityComments) {
    if (seenContractIds.has(comment.contractId)) continue
    activityItems.push({
      type: 'comment',
      id: comment.id,
      contractId: comment.contractId,
      createdTime: comment.createdTime,
      data: comment,
    })
  }

  for (const contract of feedData.activityNewContracts) {
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
  const mixedItems: FeedItem[] = []
  const maxLen = Math.max(feedItems.length, activityFeedItems.length)

  for (let i = 0; i < maxLen; i++) {
    if (i < feedItems.length) {
      mixedItems.push(feedItems[i])
    }
    if (i < activityFeedItems.length) {
      mixedItems.push(activityFeedItems[i])
    }
  }

  // Interleave boosted items: first one near top, rest spread throughout
  if (boostedItems.length === 0) {
    return mixedItems
  }

  const result: FeedItem[] = []
  let boostedIndex = 0

  // Put first boosted item at position 1 (after first regular item)
  if (mixedItems.length > 0) {
    result.push(mixedItems[0])
  }
  if (boostedItems.length > 0) {
    result.push(boostedItems[0])
    boostedIndex = 1
  }

  // Spread remaining boosted items throughout the rest of the feed
  const remainingMixed = mixedItems.slice(1)
  const remainingBoosted = boostedItems.slice(1)

  if (remainingBoosted.length === 0) {
    result.push(...remainingMixed)
    return result
  }

  // Calculate interval for remaining boosted items
  const interval = Math.max(
    4,
    Math.floor(remainingMixed.length / remainingBoosted.length)
  )

  for (let i = 0; i < remainingMixed.length; i++) {
    result.push(remainingMixed[i])
    // Insert a boosted item every `interval` items
    if (boostedIndex < boostedItems.length && (i + 1) % interval === 0) {
      result.push(boostedItems[boostedIndex])
      boostedIndex++
    }
  }

  // Add any remaining boosted items at the end
  while (boostedIndex < boostedItems.length) {
    result.push(boostedItems[boostedIndex])
    boostedIndex++
  }

  return result
}
