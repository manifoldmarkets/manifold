import { PortfolioMetrics } from 'common/user'
import { formatMoney } from 'common/util/format'
import { last } from 'lodash'
import { memo, useEffect, useState } from 'react'
import { Period, getPortfolioHistory } from 'web/lib/firebase/users'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { PortfolioValueGraph } from './portfolio-value-graph'
import { DAY_MS } from 'common/util/time'

const periodToCutoff = (now: number, period: Period) => {
  switch (period) {
    case 'daily':
      return now - 1 * DAY_MS
    case 'weekly':
      return now - 7 * DAY_MS
    case 'monthly':
      return now - 30 * DAY_MS
    case 'allTime':
    default:
      return new Date(0)
  }
}

export const PortfolioValueSection = memo(
  function PortfolioValueSection(props: { userId: string }) {
    const { userId } = props

    const [portfolioPeriod, setPortfolioPeriod] = useState<Period>('weekly')
    const [portfolioHistory, setUsersPortfolioHistory] = useState<
      PortfolioMetrics[]
    >([])

    useEffect(() => {
      const cutoff = periodToCutoff(Date.now(), portfolioPeriod).valueOf()
      getPortfolioHistory(userId, cutoff).then(setUsersPortfolioHistory)
    }, [portfolioPeriod, userId])

    const lastPortfolioMetrics = last(portfolioHistory)
    if (portfolioHistory.length === 0 || !lastPortfolioMetrics) {
      return <></>
    }

    return (
      <div>
        <Row className="gap-8">
          <div className="mb-4 w-full">
            <Col className="items-center justify-center">
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
            value={portfolioPeriod}
            onChange={(e) => {
              setPortfolioPeriod(e.target.value as Period)
            }}
          >
            <option value="allTime">All time</option>
            <option value="weekly">Last 7d</option>
            {/* Note: 'daily' seems to be broken? */}
            {/* <option value="daily">Last 24h</option> */}
          </select>
        </Row>
        <PortfolioValueGraph
          portfolioHistory={portfolioHistory}
          includeTime={portfolioPeriod == 'daily'}
        />
      </div>
    )
  }
)
