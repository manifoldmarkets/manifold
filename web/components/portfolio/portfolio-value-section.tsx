import clsx from 'clsx'
import { formatMoney } from 'common/util/format'
import { last } from 'lodash'
import { memo, useRef, useState } from 'react'
import { usePortfolioHistory } from 'web/hooks/use-portfolio-history'
import { Period } from 'web/lib/firebase/users'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { PortfolioValueGraph } from './portfolio-value-graph'

export const PortfolioValueSection = memo(
  function PortfolioValueSection(props: { userId: string }) {
    const { userId } = props

    const [portfolioPeriod, setPortfolioPeriod] = useState<Period>('weekly')
    const portfolioHistory = usePortfolioHistory(userId, portfolioPeriod)
    const [graphMode, setGraphMode] = useState<'profit' | 'value'>('profit')
    const [graphDisplayNumber, setGraphDisplayNumber] = useState<
      number | string | null
    >(null)
    const handleGraphDisplayChange = (num: string | number | null) => {
      setGraphDisplayNumber(num)
    }

    // Remember the last defined portfolio history.
    const portfolioRef = useRef(portfolioHistory)
    if (portfolioHistory) portfolioRef.current = portfolioHistory
    const currPortfolioHistory = portfolioRef.current

    const lastPortfolioMetrics = last(currPortfolioHistory)
    if (!currPortfolioHistory || !lastPortfolioMetrics) {
      return <></>
    }

    const { balance, investmentValue, totalDeposits } = lastPortfolioMetrics
    const totalValue = balance + investmentValue
    const totalProfit = totalValue - totalDeposits
    return (
      <>
        <Row className="mb-2 justify-between">
          <Row className="gap-4 sm:gap-8">
            <Col
              className={clsx(
                'cursor-pointer',
                graphMode != 'profit'
                  ? 'cursor-pointer opacity-40 hover:opacity-80'
                  : ''
              )}
              onClick={() => setGraphMode('profit')}
            >
              <div className="text-greyscale-6 text-xs sm:text-sm">Profit</div>
              <div
                className={clsx(
                  graphMode === 'profit'
                    ? graphDisplayNumber
                      ? graphDisplayNumber.toString().includes('-')
                        ? 'text-red-600'
                        : 'text-teal-500'
                      : totalProfit > 0
                      ? 'text-teal-500'
                      : 'text-red-600'
                    : totalProfit > 0
                    ? 'text-teal-500'
                    : 'text-red-600',
                  'text-lg sm:text-xl'
                )}
              >
                {graphMode === 'profit'
                  ? graphDisplayNumber
                    ? graphDisplayNumber
                    : formatMoney(totalProfit)
                  : formatMoney(totalProfit)}
              </div>
            </Col>

            <Col
              className={clsx(
                'cursor-pointer',
                graphMode != 'value' ? 'opacity-40 hover:opacity-80' : ''
              )}
              onClick={() => setGraphMode('value')}
            >
              <div className="text-greyscale-6 text-xs sm:text-sm">
                Portfolio value
              </div>
              <div className={clsx('text-lg text-indigo-600 sm:text-xl')}>
                {graphMode === 'value'
                  ? graphDisplayNumber
                    ? graphDisplayNumber
                    : formatMoney(totalValue)
                  : formatMoney(totalValue)}
              </div>
            </Col>
          </Row>
        </Row>
        <PortfolioValueGraph
          portfolioHistory={currPortfolioHistory}
          mode={graphMode}
          handleGraphDisplayChange={handleGraphDisplayChange}
        />
        <PortfolioPeriodSelection
          portfolioPeriod={portfolioPeriod}
          setPortfolioPeriod={setPortfolioPeriod}
          className="border-greyscale-2 mt-2 gap-4 border-b"
          selectClassName="text-indigo-600 text-bold border-b border-indigo-600"
        />
      </>
    )
  }
)

export function PortfolioPeriodSelection(props: {
  setPortfolioPeriod: (string: any) => void
  portfolioPeriod: string
  className?: string
  selectClassName?: string
}) {
  const { setPortfolioPeriod, portfolioPeriod, className, selectClassName } =
    props
  return (
    <Row className={clsx(className, 'text-greyscale-4')}>
      <button
        className={clsx(portfolioPeriod === 'daily' ? selectClassName : '')}
        onClick={() => setPortfolioPeriod('daily' as Period)}
      >
        1D
      </button>
      <button
        className={clsx(portfolioPeriod === 'weekly' ? selectClassName : '')}
        onClick={() => setPortfolioPeriod('weekly' as Period)}
      >
        1W
      </button>
      <button
        className={clsx(portfolioPeriod === 'monthly' ? selectClassName : '')}
        onClick={() => setPortfolioPeriod('monthly' as Period)}
      >
        1M
      </button>
      <button
        className={clsx(portfolioPeriod === 'allTime' ? selectClassName : '')}
        onClick={() => setPortfolioPeriod('allTime' as Period)}
      >
        ALL
      </button>
    </Row>
  )
}
