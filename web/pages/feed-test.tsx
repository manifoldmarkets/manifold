import { useCallback, useEffect, useState } from 'react'
import { uniqBy } from 'lodash'
import clsx from 'clsx'

import { Contract } from 'common/contract'
import { SEO } from 'web/components/SEO'
import { Page } from 'web/components/layout/page'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import {
  FeedContractCard,
  LoadingCards,
} from 'web/components/contract/feed-contract-card'
import { VisibilityObserver } from 'web/components/widgets/visibility-observer'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { useUser, usePrivateUser } from 'web/hooks/use-user'
import { api } from 'web/lib/api/api'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'

type EmbeddingFeedData = {
  contracts: Contract[]
  idsToReason: Record<string, string>
  offset: number
}

type CurrentFeedData = {
  contracts: Contract[]
  idsToReason: Record<string, string>
  offset: number
}

function FeedColumn(props: {
  title: string
  contracts: Contract[]
  idsToReason: Record<string, string>
  loading: boolean
  onLoadMore: () => void
  color: 'primary' | 'teal'
  onCardClick?: () => void
  clickCount?: number
}) {
  const {
    title,
    contracts,
    idsToReason,
    loading,
    onLoadMore,
    color,
    onCardClick,
    clickCount,
  } = props

  const colorClasses =
    color === 'primary'
      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
      : 'border-teal-500 bg-teal-50 dark:bg-teal-900/20'

  const badgeClasses =
    color === 'primary'
      ? 'bg-primary-100 text-primary-700 dark:bg-primary-800 dark:text-primary-200'
      : 'bg-teal-100 text-teal-700 dark:bg-teal-800 dark:text-teal-200'

  return (
    <Col className="flex-1 gap-2">
      <div
        className={clsx('rounded-lg border-2 p-3', colorClasses)}
      >
        <Row className="items-center justify-between">
          <div className="text-lg font-bold">{title}</div>
          {clickCount !== undefined && clickCount > 0 && (
            <span className="text-ink-500 text-sm font-medium">
              {clickCount} clicks
            </span>
          )}
        </Row>
      </div>

      {contracts.map((contract) => {
        const reason = idsToReason[contract.id]
        return (
          // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
          <div key={contract.id} className="relative" onClick={onCardClick}>
            {reason && (
              <span
                className={clsx(
                  'absolute right-2 top-2 z-10 rounded-full px-2 py-0.5 text-xs font-medium',
                  reason === 'new_creator'
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-800 dark:text-amber-200'
                    : badgeClasses
                )}
              >
                {reason === 'new_creator'
                  ? 'New Creator'
                  : reason === 'embedding'
                  ? 'Embedding Match'
                  : reason === 'trending'
                  ? 'Trending'
                  : reason}
              </span>
            )}
            <FeedContractCard
              contract={contract}
              trackingPostfix={`feed-test-${color}`}
            />
          </div>
        )
      })}

      <div className="relative">
        {loading && <LoadingCards rows={2} />}
        <VisibilityObserver
          className="pointer-events-none absolute bottom-0 h-screen w-full select-none"
          onVisibilityUpdated={(visible) => {
            if (visible && !loading) {
              onLoadMore()
            }
          }}
        />
      </div>

      {contracts.length === 0 && !loading && (
        <div className="text-ink-500 p-8 text-center">
          No markets found. Run the pre-compute script first.
        </div>
      )}
    </Col>
  )
}

export default function FeedTestPage() {
  const user = useUser()
  const privateUser = usePrivateUser()
  useRedirectIfSignedOut()

  // Current feed state
  const [currentFeed, setCurrentFeed] =
    usePersistentInMemoryState<CurrentFeedData>(
      { contracts: [], idsToReason: {}, offset: 0 },
      `feed-test-current-${user?.id ?? ''}`
    )
  const [currentLoading, setCurrentLoading] = useState(false)

  // Embedding feed state
  const [embeddingFeed, setEmbeddingFeed] =
    usePersistentInMemoryState<EmbeddingFeedData>(
      { contracts: [], idsToReason: {}, offset: 0 },
      `feed-test-embedding-${user?.id ?? ''}`
    )
  const [embeddingLoading, setEmbeddingLoading] = useState(false)

  const [initialLoading, setInitialLoading] = useState(true)

  // Click tracking per column, persisted in localStorage
  const [currentClicks, setCurrentClicks] = useState(() => {
    if (typeof window === 'undefined') return 0
    return parseInt(localStorage.getItem('feed-test-current-clicks') ?? '0')
  })
  const [embeddingClicks, setEmbeddingClicks] = useState(() => {
    if (typeof window === 'undefined') return 0
    return parseInt(localStorage.getItem('feed-test-embedding-clicks') ?? '0')
  })
  const onCurrentClick = useCallback(() => {
    setCurrentClicks((c) => {
      const next = c + 1
      localStorage.setItem('feed-test-current-clicks', String(next))
      return next
    })
  }, [])
  const onEmbeddingClick = useCallback(() => {
    setEmbeddingClicks((c) => {
      const next = c + 1
      localStorage.setItem('feed-test-embedding-clicks', String(next))
      return next
    })
  }, [])

  const blockedGroupSlugs = privateUser?.blockedGroupSlugs ?? []
  const blockedContractIds = privateUser?.blockedContractIds ?? []
  const blockedUserIds = privateUser?.blockedUserIds ?? []

  const fetchCurrentFeed = async () => {
    if (currentLoading || !user) return
    setCurrentLoading(true)
    try {
      const data = await api('get-unified-feed', {
        userId: user.id,
        feedLimit: 10,
        feedOffset: currentFeed.offset,
        activityLimit: 5,
        activityOffset: currentFeed.offset,
        ignoreContractIds: currentFeed.contracts.map((c) => c.id),
        blockedUserIds,
        blockedGroupSlugs,
        blockedContractIds,
      })
      const allContracts = [
        ...data.contracts,
        ...data.boostedContracts,
        ...data.activityNewContracts,
        ...data.activityRelatedContracts,
      ]
      const allReasons = {
        ...data.idsToReason,
        ...Object.fromEntries(
          data.boostedContracts.map((c) => [c.id, 'boosted'])
        ),
        ...Object.fromEntries(
          data.activityNewContracts.map((c) => [c.id, 'new'])
        ),
        ...Object.fromEntries(
          data.activityRelatedContracts.map((c) => [c.id, 'activity'])
        ),
      }
      setCurrentFeed((prev) => ({
        contracts: uniqBy([...prev.contracts, ...allContracts], 'id'),
        idsToReason: { ...prev.idsToReason, ...allReasons },
        offset: prev.offset + 10,
      }))
    } catch (e) {
      console.error('Error fetching current feed:', e)
    } finally {
      setCurrentLoading(false)
      setInitialLoading(false)
    }
  }

  const fetchEmbeddingFeed = async () => {
    if (embeddingLoading || !user) return
    setEmbeddingLoading(true)
    try {
      const data = await api('get-embedding-feed', {
        limit: 10,
        offset: embeddingFeed.offset,
        ignoreContractIds: embeddingFeed.contracts.map((c) => c.id),
      })
      setEmbeddingFeed((prev) => ({
        contracts: uniqBy([...prev.contracts, ...data.contracts], 'id'),
        idsToReason: { ...prev.idsToReason, ...data.idsToReason },
        offset: prev.offset + 10,
      }))
    } catch (e) {
      console.error('Error fetching embedding feed:', e)
    } finally {
      setEmbeddingLoading(false)
      setInitialLoading(false)
    }
  }

  // Initial fetch for both feeds
  useEffect(() => {
    if (
      user &&
      currentFeed.contracts.length === 0 &&
      embeddingFeed.contracts.length === 0
    ) {
      fetchCurrentFeed()
      fetchEmbeddingFeed()
    }
  }, [user?.id])

  if (!user || initialLoading) {
    return (
      <Page trackPageView="feed-test">
        <SEO
          title="Feed Test"
          description="Compare feed algorithms"
          url="/feed-test"
        />
        <LoadingCards />
      </Page>
    )
  }

  return (
    <Page trackPageView="feed-test" className="lg:px-4">
      <SEO
        title="Feed Test"
        description="Compare feed algorithms side by side"
        url="/feed-test"
      />

      <Col className="mb-4 gap-1">
        <h1 className="text-primary-700 text-2xl font-bold">
          Feed Algorithm A/B Test
        </h1>
        <p className="text-ink-500 text-sm">
          Left: current topic-based feed. Right: embedding-enhanced feed with
          new creator discovery. Which shows you better markets?
        </p>
      </Col>

      <Row className="gap-4">
        <FeedColumn
          title="Current Algorithm"
          contracts={currentFeed.contracts}
          idsToReason={currentFeed.idsToReason}
          loading={currentLoading}
          onLoadMore={fetchCurrentFeed}
          color="primary"
          onCardClick={onCurrentClick}
          clickCount={currentClicks}
        />
        <FeedColumn
          title="Test Algorithm"
          contracts={embeddingFeed.contracts}
          idsToReason={embeddingFeed.idsToReason}
          loading={embeddingLoading}
          onLoadMore={fetchEmbeddingFeed}
          color="teal"
          onCardClick={onEmbeddingClick}
          clickCount={embeddingClicks}
        />
      </Row>
    </Page>
  )
}
