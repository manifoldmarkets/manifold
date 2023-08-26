import Masonry from 'react-masonry-css'
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
    <Col className="gap-8">
      <Masonry
        // Show only 1 column on tailwind's md breakpoint (768px)
        breakpointCols={props.breakpointColumns ?? { default: 2, 768: 1 }}
        className="-ml-4 flex w-auto"
        columnClassName="pl-4 bg-clip-padding space-y-4"
      >
        {contracts.map((contract) => (
          <FeedContractCard
            contract={contract}
            key={contract.id}
            trackingPostfix={trackingPostfix}
            small
          />
        ))}
      </Masonry>
      {loadMore && <LoadMoreUntilNotVisible loadMore={loadMore} />}
    </Col>
  )
}
