import clsx from 'clsx'
import { formatMoney } from 'common/util/format'
import { last } from 'lodash'
import { memo, useRef, useState } from 'react'
import { usePortfolioHistory } from 'web/hooks/use-portfolio-history'
import { Period } from 'web/lib/firebase/users'
import { PillButton } from '../buttons/pill-button'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Spacer } from '../layout/spacer'
import { PortfolioValueGraph } from './portfolio-value-graph'

export const PortfolioValueSection = memo(
  function PortfolioValueSection(props: { userId: string }) {
    const { userId } = props

    const [portfolioPeriod, setPortfolioPeriod] = useState<Period>('weekly')
    const portfolioHistory = usePortfolioHistory(userId, portfolioPeriod)
    const [graphMode, setGraphMode] = useState<'profit' | 'value'>('profit')

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
        <Row className="justify-between">
          <Row className="gap-4 sm:gap-8 ">
            <Col>
              <div className="text-greyscale-4 text-xs sm:text-sm">
                Portfolio value
              </div>
              <div className="text-lg text-indigo-600 sm:text-xl">
                {formatMoney(totalValue)}
              </div>
            </Col>
            <Col>
              <div className="text-greyscale-4 text-xs sm:text-sm">Profit</div>
              <div
                className={clsx(
                  totalProfit > 0 ? 'text-green-500' : 'text-red-600',
                  'text-lg sm:text-xl'
                )}
              >
                {formatMoney(totalProfit)}
              </div>
            </Col>
          </Row>
          <GraphToggle setGraphMode={setGraphMode} graphMode={graphMode} />
        </Row>
        <PortfolioValueGraph
          portfolioHistory={currPortfolioHistory}
          includeTime={true}
          mode={graphMode}
        />
        <PortfolioPeriodSelection
          portfolioPeriod={portfolioPeriod}
          setPortfolioPeriod={setPortfolioPeriod}
          className="mt-2 gap-4"
          selectClassName="text-indigo-600 text-bold underline"
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

export function GraphToggle(props: {
  setGraphMode: (mode: 'profit' | 'value') => void
  graphMode: string
}) {
  const { setGraphMode, graphMode } = props
  return (
    <Row className="relative mt-1 ml-1 items-center gap-1.5 sm:ml-0 sm:gap-2">
      <PillButton
        selected={graphMode === 'value'}
        onSelect={() => {
          setGraphMode('value')
        }}
        xs={true}
        className="z-50"
      >
        Value
      </PillButton>
      <PillButton
        selected={graphMode === 'profit'}
        onSelect={() => {
          setGraphMode('profit')
        }}
        xs={true}
        className="z-50"
      >
        Profit
      </PillButton>
    </Row>
  )
}
