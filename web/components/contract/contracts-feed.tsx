import { useFeed } from '../../hooks/use-feed'
import { useUser } from '../../hooks/use-user'
import { Col } from '../layout/col'
import { SiteLink } from '../widgets/site-link'
import { VisibilityObserver } from '../widgets/visibility-observer'
import { ContractCardSingleColumn } from './contract-card'

export function ContractsFeed() {
  const user = useUser()
  const { contracts, loadMore } = useFeed(user, 'feed')
  console.log('contracts', contracts)

  if (!contracts) return null

  return (
    <Col>
      <Col className="divide-y first:border-t max-w-[600px]">
        {contracts.map((contract) => (
          <ContractCardSingleColumn key={contract.id} contract={contract} />
        ))}
      </Col>

      <VisibilityObserver
        onVisibilityUpdated={(visible) => visible && loadMore()}
      />

      {!contracts.length && (
        <div className="flex w-full flex-col items-center justify-center">
          We're fresh out of cards!
          <SiteLink href="/markets?s=newest&f=open" className="text-indigo-700">
            Browse new markets
          </SiteLink>
        </div>
      )}
    </Col>
  )
}
