import { Contract } from 'common/contract'
import { FeedCard } from 'components/contract/FeedCard'
import { Col } from 'components/layout/col'
import { EXAMPLE_CONTRACTS } from 'constants/examples/ExampleContracts'

export function Feed({ tab }: { tab: string }) {
  // TODO: Grab appropriate contracts for each tab

  return (
    <Col>
      {EXAMPLE_CONTRACTS.map((contract, index) => (
        <FeedCard key={index} contract={contract as Contract} />
      ))}
    </Col>
  )
}
