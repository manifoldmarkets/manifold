import { Col } from 'web/components/layout/col'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import clsx from 'clsx'
import Link from 'next/link'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { FeedContractCard } from 'web/components/contract/feed-contract-card'
import { VisibilityObserver } from 'web/components/widgets/visibility-observer'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { useEffect } from 'react'
import { APIResponse } from 'common/api/schema'
import { uniqBy } from 'lodash'

export function ScoredFeed(props: { userId: string; className?: string }) {
  const { userId, className } = props
  const [offset, setOffset] = usePersistentInMemoryState(
    0,
    `feed-offset-${userId}`
  )
  const limit = 5
  const [feedData, setFeedData] = usePersistentInMemoryState(
    { contracts: [], comments: [], idsToReason: {} } as APIResponse<'get-feed'>,
    `feed-data-${userId}`
  )
  const ignoreContractIds = feedData.contracts.map((c) => c.id)
  const { data, error } = useAPIGetter('get-feed', {
    userId,
    offset,
    limit,
    ignoreContractIds,
  })

  if (error) {
    console.error(error.message)
  }

  useEffect(() => {
    if (!data) return
    setFeedData({
      contracts: uniqBy(feedData.contracts.concat(data.contracts), 'id'),
      comments: uniqBy(feedData.comments.concat(data.comments), 'id'),
      idsToReason: { ...feedData.idsToReason, ...data.idsToReason },
    })
  }, [data])
  const { contracts, idsToReason } = feedData

  if (data === undefined && contracts.length === 0)
    return <LoadingIndicator className={className} />

  return (
    <Col className={clsx('relative w-full gap-4', className)}>
      {contracts.map((contract) => (
        <FeedContractCard
          contract={contract}
          key={contract.id}
          endpointReason={idsToReason?.[contract.id]}
        />
      ))}
      <div className="relative">
        <VisibilityObserver
          className="pointer-events-none absolute bottom-0 h-screen w-full select-none"
          onVisibilityUpdated={(visible) =>
            visible && setOffset(offset + limit)
          }
        />
      </div>
      {contracts.length === 0 && (
        <div className="text-ink-1000 m-4 flex w-full flex-col items-center justify-center">
          <div>Congratulations!</div>
          <div>You've reached the end of the feed.</div>
          <div>You are free.</div>
          <br />
          <Link
            href="/browse?s=newest&f=open"
            className="text-primary-700 hover:underline"
          >
            Browse new questions
          </Link>
          <Link href="/create" className="text-primary-700 hover:underline">
            Create a question
          </Link>
        </div>
      )}
    </Col>
  )
}
