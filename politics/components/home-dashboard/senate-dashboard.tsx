import { Col } from 'web/components/layout/col'
import { StateElectionMap } from '../usa-map/state-election-map'

export function SenateDashboard() {
  return (
    <Col>
      <StateElectionMap mode={'senate'} />
    </Col>
  )
}
