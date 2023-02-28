import { useFeed } from '../../hooks/use-feed'
import { useUser } from '../../hooks/use-user'
import { Col } from '../layout/col'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { SiteLink } from '../widgets/site-link'
import { VisibilityObserver } from '../widgets/visibility-observer'
import { ContractCardNew } from './contract-card'

export function ContractsFeed() {
  const user = useUser()
  const { contracts, loadMore } = useFeed(user, 'feed')

  if (!contracts) return <LoadingIndicator />

  return (
    <Col>
      <Col className="divide-ink-300 border-ink-300 divide-y-[0.5px] border-[0.5px]">
        {contracts.map((contract) => (
          <ContractCardNew key={contract.id} contract={contract} />
        ))}
      </Col>

      <VisibilityObserver
        className="relative -top-96"
        onVisibilityUpdated={(visible) => visible && loadMore()}
      />

      <LoadingIndicator className="mt-4" />

      {contracts !== undefined && contracts.length === 0 && (
        <div className="text-ink-1000 m-4 flex w-full flex-col items-center justify-center">
          We're fresh out of cards!
          <SiteLink
            href="/markets?s=newest&f=open"
            className="text-primary-700"
          >
            Browse new markets
          </SiteLink>
        </div>
      )}
    </Col>
  )
}
