import { Contract } from 'common/contract'
import { Col } from 'components/layout/col'
import { EXAMPLE_TRADE_CONTRACTS } from 'constants/examples/example-trade-contracts'
import { PositionRow } from './position-row'
import { EXAMPLE_METRICS_BY_CONTRACT } from 'constants/examples/example-metrics-by-contract'
import { ContractMetric } from 'common/contract-metric'

export function Positions() {
  return (
    <Col>
      {EXAMPLE_TRADE_CONTRACTS.map((c) => {
        return (
          <PositionRow
            key={c.id}
            contract={c as Contract}
            metric={
              EXAMPLE_METRICS_BY_CONTRACT[
                c.id as keyof typeof EXAMPLE_METRICS_BY_CONTRACT
              ] as ContractMetric
            }
          />
        )
      })}
    </Col>
  )
}
