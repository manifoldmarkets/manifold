import clsx from 'clsx'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { uniqBy } from 'lodash'

import { APIResponse } from 'common/api/schema'
import { Bet } from 'common/bet'
import { ContractComment } from 'common/comment'
import { Contract } from 'common/contract'
import { Repost } from 'common/repost'
import { User } from 'common/user'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { useEvent } from 'client-common/hooks/use-event'
import { Col } from 'web/components/layout/col'
import { LoadingCards } from 'web/components/contract/feed-contract-card'
import { VisibilityObserver } from 'web/components/widgets/visibility-observer'
import { useUser } from 'web/hooks/use-user'
import { api } from 'web/lib/api/api'
import { UnifiedFeedCard } from './unified-feed-card'

type FeedData = {
  contracts: Contract[]
  comments: ContractComment[]
  bets: Bet[]
  reposts: Repost[]
  idsToReason: Record<string, string>
  offset: number
}

const defaultFeedData: FeedData = {
  contracts: [],
  comments: [],
  bets: [],
  reposts: [],
  idsToReason: {},
  offset: 0,
}

type ActivityData = {
  bets: Bet[]
  comments: ContractComment[]
}

export function UnifiedFeed(props: { className?: string }) {
  const { className } = props
  const user = useUser()
  const isLoggedIn = !!user

  const limit = 7

  // Feed data (personalized or trending contracts)
  const [feedData, setFeedData] = usePersistentInMemoryState<FeedData>(
    defaultFeedData,
    `unified-feed-data-${user?.id ?? 'logged-out'}`
  )

  // Activity data for inline display
  const [activityData, setActivityData] = usePersistentInMemoryState<
    Record<string, ActivityData>
  >({}, `unified-feed-activity-${user?.id ?? 'logged-out'}`)

  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(
    feedData.contracts.length === 0
  )

  const fetchFeed = useEvent(async () => {
    if (loading) return
    setLoading(true)

    try {
      if (isLoggedIn && user) {
        // Personalized feed for logged-in users
        const data = await api('get-feed', {
          userId: user.id,
          offset: feedData.offset,
          limit,
          ignoreContractIds: feedData.contracts.map((c) => c.id),
        })

        setFeedData((prev) => ({
          contracts: uniqBy([...prev.contracts, ...data.contracts], 'id'),
          comments: uniqBy([...prev.comments, ...data.comments], 'id'),
          bets: uniqBy([...prev.bets, ...data.bets], 'id'),
          reposts: uniqBy([...prev.reposts, ...data.reposts], 'id'),
          idsToReason: { ...prev.idsToReason, ...data.idsToReason },
          offset: prev.offset + limit,
        }))
      } else {
        // Trending feed for logged-out users
        const contracts = await api('search-markets-full', {
          term: '',
          filter: 'open',
          sort: 'score',
          limit,
          offset: feedData.offset,
        })

        setFeedData((prev) => ({
          ...prev,
          contracts: uniqBy([...prev.contracts, ...contracts], 'id'),
          offset: prev.offset + limit,
        }))
      }
    } catch (e) {
      console.error('Error fetching feed:', e)
    } finally {
      setLoading(false)
      setInitialLoading(false)
    }
  })

  // Fetch activity for contracts
  const fetchActivity = useEvent(async (contractIds: string[]) => {
    if (contractIds.length === 0) return

    // Filter to contracts we don't have activity for
    const newContractIds = contractIds.filter((id) => !activityData[id])
    if (newContractIds.length === 0) return

    try {
      const data = await api('get-site-activity', {
        limit: 5,
        offset: 0,
        types: ['bets', 'comments'],
        blockedContractIds: feedData.contracts
          .map((c) => c.id)
          .filter((id) => !newContractIds.includes(id)),
      })

      // Group activity by contract
      const newActivity: Record<string, ActivityData> = {}
      for (const contractId of newContractIds) {
        newActivity[contractId] = {
          bets: data.bets.filter((b) => b.contractId === contractId).slice(0, 3),
          comments: data.comments
            .filter((c) => c.contractId === contractId)
            .slice(0, 2),
        }
      }

      setActivityData((prev) => ({ ...prev, ...newActivity }))
    } catch (e) {
      console.error('Error fetching activity:', e)
    }
  })

  // Initial fetch
  useEffect(() => {
    if (feedData.contracts.length === 0) {
      fetchFeed()
    }
  }, [user?.id])

  // Fetch activity for new contracts
  useEffect(() => {
    const contractIds = feedData.contracts.map((c) => c.id)
    fetchActivity(contractIds)
  }, [feedData.contracts.length])

  const { contracts, reposts, comments, bets, idsToReason } = feedData

  if (initialLoading) {
    return <LoadingCards />
  }

  return (
    <Col className={clsx('relative w-full gap-4', className)}>
      {contracts.map((contract) => {
        const repost = reposts.find((r) => r.contract_id === contract.id)
        const comment = comments.find((c) => c.contractId === contract.id)
        const bet = bets.find((b) => b.contractId === contract.id)
        const activity = activityData[contract.id]

        return (
          <UnifiedFeedCard
            key={contract.id + (comment?.id ?? '')}
            contract={contract}
            repost={repost}
            comment={comment}
            bet={bet}
            user={user}
            reason={idsToReason[contract.id]}
            recentBets={activity?.bets}
            recentComments={activity?.comments}
          />
        )
      })}

      <div className="relative">
        {loading && <LoadingCards rows={1} />}
        <VisibilityObserver
          className="pointer-events-none absolute bottom-0 h-screen w-full select-none"
          onVisibilityUpdated={(visible) => {
            if (visible && !loading) {
              fetchFeed()
            }
          }}
        />
      </div>

      {contracts.length === 0 && !loading && (
        <div className="text-ink-1000 m-4 flex w-full flex-col items-center justify-center">
          <div>No markets found.</div>
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
