import { PortfolioMetrics } from 'common/user'
import { formatMoney } from 'common/util/format'
import { last } from 'lodash'
import { memo, useState } from 'react'
import { Period } from 'web/lib/firebase/users'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { PortfolioValueGraph } from './portfolio-value-graph'

export const PortfolioValueSection = memo(
  function PortfolioValueSection(props: {
    portfolioHistory: PortfolioMetrics[]
  }) {
    const { portfolioHistory } = props
    const lastPortfolioMetrics = last(portfolioHistory)
    const [portfolioPeriod, setPortfolioPeriod] = useState<Period>('allTime')

    if (portfolioHistory.length === 0 || !lastPortfolioMetrics) {
      return <></>
    }

    // PATCH: If portfolio history started on June 1st, then we label it as "Since June"
    // instead of "All time"
    const allTimeLabel =
      lastPortfolioMetrics.timestamp < Date.parse('2022-06-20T00:00:00.000Z')
        ? 'Since June'
        : 'All time'

    return (
      <div>
        <Row className="gap-8">
          <div className="mb-4 w-full">
            <Col>
              <div className="text-sm text-gray-500">Portfolio value</div>
              <div className="text-lg">
                {formatMoney(
                  lastPortfolioMetrics.balance +
                    lastPortfolioMetrics.investmentValue
                )}
              </div>
            </Col>
          </div>
          <select
            className="select select-bordered self-start"
            onChange={(e) => {
              setPortfolioPeriod(e.target.value as Period)
            }}
          >
            <option value="allTime">{allTimeLabel}</option>
            <option value="weekly">7 days</option>
            <option value="daily">24 hours</option>
          </select>
        </Row>
        <PortfolioValueGraph
          portfolioHistory={portfolioHistory}
          period={portfolioPeriod}
        />
      </div>
    )
  }
)
