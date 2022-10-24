import clsx from 'clsx'
import { formatMoney } from 'common/util/format'
import { last } from 'lodash'
import { memo, useState } from 'react'
import { usePortfolioHistory } from 'web/hooks/use-portfolio-history'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { GraphMode, PortfolioGraph } from './portfolio-value-graph'
import { SizedContainer } from 'web/components/sized-container'

export const PortfolioValueSection = memo(
  function PortfolioValueSection(props: { userId: string }) {
    const { userId } = props

    const portfolioHistory = usePortfolioHistory(userId, 'allTime')
    const [graphMode, setGraphMode] = useState<GraphMode>('profit')
    const [graphDisplayNumber, setGraphDisplayNumber] = useState<
      number | string | null
    >(null)
    const handleGraphDisplayChange = (p: { y: number } | undefined) => {
      setGraphDisplayNumber(p != null ? formatMoney(p.y) : null)
    }

    const lastPortfolioMetrics = last(portfolioHistory)
    if (!portfolioHistory || !lastPortfolioMetrics) {
      return <></>
    }

    const { balance, investmentValue, totalDeposits } = lastPortfolioMetrics
    const totalValue = balance + investmentValue
    const totalProfit = totalValue - totalDeposits
    return (
      <>
        <Row className="mb-2 justify-between">
          <Row className="gap-2">
            <Col
              className={clsx(
                'w-24 cursor-pointer sm:w-28 ',
                graphMode != 'profit'
                  ? 'cursor-pointer opacity-40 hover:opacity-80'
                  : ''
              )}
              onClick={() => {
                setGraphMode('profit')
                setGraphDisplayNumber(null)
              }}
            >
              <div className="text-greyscale-6 text-xs sm:text-sm">Profit</div>
              <div
                className={clsx(
                  graphMode === 'profit'
                    ? graphDisplayNumber
                      ? graphDisplayNumber.toString().includes('-')
                        ? 'text-scarlet-500'
                        : 'text-teal-500'
                      : totalProfit > 0
                      ? 'text-teal-500'
                      : 'text-scarlet-500'
                    : totalProfit > 0
                    ? 'text-teal-500'
                    : 'text-scarlet-500',
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
                'w-24 cursor-pointer sm:w-28',
                graphMode != 'value' ? 'opacity-40 hover:opacity-80' : ''
              )}
              onClick={() => {
                setGraphMode('value')
                setGraphDisplayNumber(null)
              }}
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
        <SizedContainer fullHeight={200} mobileHeight={100}>
          {(width, height) => (
            <PortfolioGraph
              key={graphMode} // we need to reset axis scale state if mode changes
              mode={graphMode}
              history={portfolioHistory}
              width={width}
              height={height}
              onMouseOver={handleGraphDisplayChange}
            />
          )}
        </SizedContainer>
      </>
    )
  }
)
