import clsx from 'clsx'
import { formatMoney } from 'common/util/format'
import { last } from 'lodash'
import { memo, ReactNode, useState, useMemo } from 'react'
import { usePortfolioHistory } from 'web/hooks/use-portfolio-history'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { GraphMode, PortfolioGraph } from './portfolio-value-graph'
import { SizedContainer } from 'web/components/sized-container'
import { Period } from 'web/lib/firebase/users'
import { useEvent } from 'web/hooks/use-event'
import PlaceholderGraph from 'web/lib/icons/placeholder-graph'
import { TimeRangePicker } from '../charts/time-range-picker'
import { ColorType } from '../widgets/choices-toggle-group'
import { useSingleValueHistoryChartViewScale } from '../charts/generic-charts'
import { AddFundsButton } from '../profile/add-funds-button'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { track } from 'web/lib/service/analytics'

export const PortfolioValueSection = memo(
  function PortfolioValueSection(props: { userId: string }) {
    const { userId } = props
    const [currentTimePeriod, setCurrentTimePeriod] = useState<Period>('weekly')
    const portfolioHistory = usePortfolioHistory(userId, currentTimePeriod)
    const [graphMode, setGraphMode] = useState<GraphMode>('profit')
    const graphPoints = useMemo(
      () =>
        portfolioHistory?.map((p) => ({
          x: p.timestamp,
          y:
            p.balance +
            p.investmentValue -
            (graphMode === 'profit' ? p.totalDeposits : 0),
          obj: p,
        })),
      [portfolioHistory, graphMode]
    )

    const [graphDisplayNumber, setGraphDisplayNumber] = useState<
      number | string | null
    >(null)
    const handleGraphDisplayChange = (p: { y: number } | undefined) => {
      setGraphDisplayNumber(p != null ? formatMoney(p.y) : null)
    }
    const lastPortfolioMetrics = last(portfolioHistory)
    const onClickNumber = useEvent((mode: GraphMode) => {
      setGraphMode(mode)
      setGraphDisplayNumber(null)
      graphView.setViewYScale(undefined)
    })
    const graphView = useSingleValueHistoryChartViewScale()
    const isMobile = useIsMobile()

    //zooms out of graph if zoomed in upon time selection change
    const setTimePeriod = useEvent((timePeriod: Period) => {
      setCurrentTimePeriod(timePeriod)
      graphView.setViewXScale(undefined)
      graphView.setViewYScale(undefined)
    })

    // placeholder when loading
    if (graphPoints === undefined || !lastPortfolioMetrics) {
      return (
        <PortfolioValueSkeleton
          userId={userId}
          graphMode={graphMode}
          onClickNumber={onClickNumber}
          currentTimePeriod={currentTimePeriod}
          setCurrentTimePeriod={setCurrentTimePeriod}
          profitElement={
            <div className="text-ink-500 animate-pulse text-lg sm:text-xl">
              ---
            </div>
          }
          valueElement={
            <div className="text-ink-500 animate-pulse text-lg sm:text-xl">
              ---
            </div>
          }
          graphElement={(_width, height) => (
            <div
              style={{
                height: `${height - 40}px`,
                margin: '20px 70px 20px 10px',
              }}
            >
              <PlaceholderGraph className="text-ink-400 h-full w-full animate-pulse" />
            </div>
          )}
          disabled={true}
          placement={isMobile ? 'bottom' : undefined}
        />
      )
    }

    const { balance, investmentValue, totalDeposits } = lastPortfolioMetrics
    const totalValue = balance + investmentValue
    const totalProfit = totalValue - totalDeposits
    return (
      <PortfolioValueSkeleton
        userId={userId}
        graphMode={graphMode}
        onClickNumber={onClickNumber}
        currentTimePeriod={currentTimePeriod}
        setCurrentTimePeriod={setTimePeriod}
        switcherColor={
          graphMode === 'value' ? 'indigo' : totalProfit > 0 ? 'green' : 'red'
        }
        profitElement={
          <div
            className={clsx(
              graphMode === 'profit'
                ? graphDisplayNumber
                  ? graphDisplayNumber.toString().includes('-')
                    ? 'text-scarlet-500'
                    : 'text-teal-500'
                  : totalProfit >= 0
                  ? 'text-teal-500'
                  : 'text-scarlet-500'
                : totalProfit >= 0
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
        }
        valueElement={
          <div className={clsx('text-primary-600 text-lg sm:text-xl')}>
            {graphMode === 'value'
              ? graphDisplayNumber
                ? graphDisplayNumber
                : formatMoney(totalValue)
              : formatMoney(totalValue)}
          </div>
        }
        graphElement={
          graphPoints.length <= 1
            ? () => <></> // hide graph for new users
            : (width, height) => (
                <PortfolioGraph
                  key={graphMode} // we need to reset axis scale state if mode changes
                  mode={graphMode}
                  points={graphPoints}
                  width={width}
                  height={height}
                  viewScaleProps={graphView}
                  onMouseOver={handleGraphDisplayChange}
                />
              )
        }
        placement={isMobile ? 'bottom' : undefined}
      />
    )
  }
)

export function PortfolioValueSkeleton(props: {
  graphMode: GraphMode
  onClickNumber: (mode: GraphMode) => void
  currentTimePeriod: Period
  setCurrentTimePeriod: (timePeriod: Period) => void
  profitElement: ReactNode
  valueElement: ReactNode
  graphElement: (width: number, height: number) => ReactNode
  switcherColor?: ColorType
  userId?: string
  disabled?: boolean
  placement?: 'bottom'
}) {
  const {
    graphMode,
    onClickNumber,
    currentTimePeriod,
    setCurrentTimePeriod,
    profitElement,
    valueElement,
    graphElement,
    switcherColor,
    userId,
    disabled,
    placement,
  } = props
  return (
    <>
      <Row
        className={clsx(
          'mb-1 items-start gap-2 sm:mb-2',
          placement === 'bottom' ? 'ml-2 gap-8' : ''
        )}
      >
        <Col
          className={clsx(
            'w-24 cursor-pointer sm:w-28 ',
            graphMode != 'profit'
              ? 'cursor-pointer opacity-40 hover:opacity-80'
              : ''
          )}
          onClick={() => {
            onClickNumber('profit')
            track('Trading Profits Clicked')
          }}
        >
          <div className="text-ink-600 text-xs sm:text-sm">Trading profits</div>
          {profitElement}
        </Col>

        <Col
          className={clsx(
            'w-24 cursor-pointer sm:w-28',
            graphMode != 'value' ? 'opacity-40 hover:opacity-80' : ''
          )}
          onClick={() => {
            onClickNumber('value')
            track('Portfolio Value Clicked')
          }}
        >
          <div className="text-ink-600 text-xs sm:text-sm">Portfolio value</div>
          {valueElement}
        </Col>

        <AddFundsButton userId={userId} className="self-center max-sm:hidden" />

        {!placement && (
          <TimeRangePicker
            currentTimePeriod={currentTimePeriod}
            setCurrentTimePeriod={setCurrentTimePeriod}
            color={switcherColor}
            disabled={disabled}
            className="ml-auto"
          />
        )}
      </Row>
      <SizedContainer fullHeight={200} mobileHeight={150}>
        {graphElement}
      </SizedContainer>
      {placement === 'bottom' && (
        <Col className={' mx-2 mt-1'}>
          <TimeRangePicker
            currentTimePeriod={currentTimePeriod}
            setCurrentTimePeriod={setCurrentTimePeriod}
            color={switcherColor}
            disabled={disabled}
            className="justify-around"
          />
        </Col>
      )}
    </>
  )
}
