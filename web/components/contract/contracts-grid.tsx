import { Contract } from 'web/lib/firebase/contracts'
import { Col } from '../layout/col'
import { ShowTime } from './contract-details'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { LoadMoreUntilNotVisible } from '../widgets/visibility-observer'
import { FeedContractCard } from './feed-contract-card'

export function ContractsGrid(props: {
  contracts: Contract[] | undefined
  loadMore?: () => Promise<boolean>
  showTime?: ShowTime
  trackingPostfix?: string
  breakpointColumns?: { [key: string]: number }
}) {
  const { contracts, loadMore, trackingPostfix } = props
  if (contracts === undefined) {
    return <LoadingIndicator />
  }

  if (contracts.length === 0) {
    return null // handle empty state outside of component
  }

  return (
    <Col className="gap-2">
      {contracts.map((contract) => (
        <FeedContractCard
          contract={contract}
          key={contract.id}
          trackingPostfix={trackingPostfix}
          small
        />
      ))}
      {loadMore && <LoadMoreUntilNotVisible loadMore={loadMore} />}
    </Col>
  )
}
