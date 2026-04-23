import { useState } from 'react'
import { PerpContract } from 'common/contract'
import { formatPrice, inferPriceDecimals } from 'common/perps/format'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { PerpChart } from './perp-chart'
import { PerpBetPanel } from './perp-bet-panel'
import { PerpPositionPanel } from './perp-position-panel'

export const PerpOverview = (props: { contract: PerpContract }) => {
  const { contract } = props
  const [chartMode, setChartMode] = useState<'price' | 'funding'>('price')

  const price = Number(contract.oraclePrice)
  // Single-sample inference: integer prices (e.g. DAU counts) show 0
  // decimals, fractional prices scale to their magnitude.
  const priceDecimals = inferPriceDecimals([price])

  return (
    <Col className="gap-4">
      <Row className="items-baseline justify-between">
        <Col>
          <div className="text-ink-500 text-sm">Oracle price</div>
          <div className="text-3xl font-semibold">
            {formatPrice(price, priceDecimals)}
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
