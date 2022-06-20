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
    const [portfolioPeriod /*setPortfolioPeriod*/] = useState<Period>('allTime')

    if (portfolioHistory.length === 0 || !lastPortfolioMetrics) {
      return <div> No portfolio history data yet </div>
    }

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
          {
            //TODO: enable day/week/monthly as data becomes available
            /*<div>
          <select
            className="select select-bordered self-start"
            value={portfolioPeriod}
            onChange={(e) => setPortfolioPeriod(e.target.value as Period)}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="allTime">All time</option>
          </select>
              </div>*/
          }
        </Row>
        <PortfolioValueGraph
          portfolioHistory={portfolioHistory}
          period={portfolioPeriod}
        />
      </div>
    )
  }
)
