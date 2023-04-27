import { useFeed } from '../../hooks/use-feed'
import { useUser } from '../../hooks/use-user'
import { Col } from '../layout/col'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { SiteLink } from '../widgets/site-link'
import { VisibilityObserver } from '../widgets/visibility-observer'
import { FeedItems } from 'web/components/feed/feed-items'

export function ContractsFeed(props: { topic?: string }) {
  const { topic } = props
  const user = useUser()
  const { contracts, boosts, loadMore } = useFeed(user, 'feed', { topic })
  const boostContracts = boosts?.map((b) => {
    const { market_data, ...rest } = b
    return { ...market_data, ...rest }
  })

  if (!contracts) return <LoadingIndicator />

  return (
    <Col>
      <FeedItems contracts={contracts} boosts={boostContracts} user={user} />

      <div className="relative">
        <VisibilityObserver
          className="pointer-events-none absolute bottom-0 h-screen w-full select-none"
          onVisibilityUpdated={(visible) => visible && loadMore()}
        />
      </div>

      {contracts.length === 0 ? (
        <div className="text-ink-1000 m-4 flex w-full flex-col items-center justify-center">
          We're fresh out of cards!
          <SiteLink
            href="/markets?s=newest&f=open"
            className="text-primary-700"
          >
            Browse new markets
          </SiteLink>
        </div>
      ) : (
        <LoadingIndicator className="mt-4" />
      )}
    </Col>
  )
}
