import { useState } from 'react'
import { PerpContract } from 'common/contract'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { PerpChart } from './perp-chart'
import { PerpBetPanel } from './perp-bet-panel'
import { PerpPositionPanel } from './perp-position-panel'

export const PerpOverview = (props: { contract: PerpContract }) => {
  const { contract } = props
  const [chartMode, setChartMode] = useState<'price' | 'funding'>('price')

  return (
    <Col className="gap-4">
      <Row className="items-baseline justify-between">
        <Col>
          <div className="text-ink-500 text-sm">Oracle price</div>
          <div className="text-3xl font-semibold">
            {Number(contract.oraclePrice).toFixed(4)}
          </div>
        </Col>
        <Row className="border-ink-200 overflow-hidden rounded-md border">
          <button
            className={`px-3 py-1 text-sm ${
              chartMode === 'price'
                ? 'bg-primary-500 text-white'
                : 'text-ink-700'
            }`}
            onClick={() => setChartMode('price')}
          >
            Price
          </button>
          <button
            className={`px-3 py-1 text-sm ${
              chartMode === 'funding'
                ? 'bg-primary-500 text-white'
                : 'text-ink-700'
            }`}
            onClick={() => setChartMode('funding')}
          >
            Funding
          </button>
        </Row>
      </Row>

      <PerpChart contract={contract} mode={chartMode} />

      <PerpBetPanel contract={contract} />
      <PerpPositionPanel contract={contract} />
    </Col>
  )
}
