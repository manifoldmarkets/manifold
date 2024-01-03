import { Col } from 'web/components/layout/col'
import { StateElectionMap } from '../usa-map/state-election-map'

export function PresidencyDashboard() {
  return (
    <Col>
      <StateElectionMap mode={'presidency'} />
    </Col>
  )
}
