import { Contract } from 'common/contract'
import { FeedCard } from 'components/contract/FeedCard'
import { Col } from 'components/layout/col'
import Page from 'components/Page'
import { EXAMPLE_CONTRACTS } from 'constants/examples/ExampleContracts'

export default function HomeScreen() {
  return (
    <Page>
      <Col>
        {EXAMPLE_CONTRACTS.map((contract, index) => (
          <FeedCard key={index} contract={contract as Contract} />
        ))}
      </Col>
    </Page>
  )
}
