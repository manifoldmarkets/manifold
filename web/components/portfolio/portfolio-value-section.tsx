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
import { ScaleContinuousNumeric, ScaleTime } from 'd3-scale'
import { AddFundsModal } from '../add-funds-modal'
import { Button } from '../buttons/button'
import { ENV_CONFIG } from 'common/envs/constants'
import { useUser } from 'web/hooks/use-user'
import { TimeRangePicker } from '../charts/time-range-picker'
import { ColorType } from '../choices-toggle-group'

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
      setGraphViewYScale(undefined)
    })
    const [graphViewXScale, setGraphViewXScale] =
      useState<ScaleTime<number, number>>()
    const [graphViewYScale, setGraphViewYScale] =
      useState<ScaleContinuousNumeric<number, number>>()
    const viewScaleProps = {
      viewXScale: graphViewXScale,
      setViewXScale: setGraphViewXScale,
      viewYScale: graphViewYScale,
      setViewYScale: setGraphViewYScale,
    }

    //zooms out of graph if zoomed in upon time selection change
    const setTimePeriod = useEvent((timePeriod: Period) => {
      setCurrentTimePeriod(timePeriod)
      setGraphViewXScale(undefined)
      setGraphViewYScale(undefined)
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
            <div className="animate-pulse text-lg text-gray-500 sm:text-xl">
              ---
            </div>
          }
          valueElement={
            <div className="animate-pulse text-lg text-gray-500 sm:text-xl">
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
              <PlaceholderGraph className="h-full w-full animate-pulse text-gray-400" />
            </div>
          )}
          disabled={true}
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
        }
        valueElement={
          <div className={clsx('text-lg text-indigo-600 sm:text-xl')}>
            {graphMode === 'value'
              ? graphDisplayNumber
                ? graphDisplayNumber
                : formatMoney(totalValue)
              : formatMoney(totalValue)}
          </div>
        }
        graphElement={(width, height) => (
          <PortfolioGraph
            key={graphMode} // we need to reset axis scale state if mode changes
            mode={graphMode}
            points={graphPoints}
            width={width}
            height={height}
            viewScaleProps={viewScaleProps}
            onMouseOver={handleGraphDisplayChange}
          />
        )}
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
  } = props
  return (
    <>
      <Row className="mb-2 gap-2">
        <Col
          className={clsx(
            'w-24 cursor-pointer sm:w-28 ',
            graphMode != 'profit'
              ? 'cursor-pointer opacity-40 hover:opacity-80'
              : ''
          )}
          onClick={() => {
            onClickNumber('profit')
          }}
        >
          <div className="text-xs text-gray-600 sm:text-sm">Profit</div>
          {profitElement}
        </Col>

        <Col
          className={clsx(
            'w-24 cursor-pointer sm:w-28',
            graphMode != 'value' ? 'opacity-40 hover:opacity-80' : ''
          )}
          onClick={() => {
            onClickNumber('value')
          }}
        >
          <div className="text-xs text-gray-600 sm:text-sm">
            Portfolio value
          </div>
          {valueElement}
        </Col>

        <AddFundsButton userId={userId} />
      </Row>
      <SizedContainer fullHeight={200} mobileHeight={100}>
        {graphElement}
      </SizedContainer>
      <TimeRangePicker
        currentTimePeriod={currentTimePeriod}
        setCurrentTimePeriod={setCurrentTimePeriod}
        color={switcherColor}
        disabled={disabled}
      />
    </>
  )
}

function AddFundsButton({ userId }: { userId?: string }) {
  const [open, setOpen] = useState(false)
  const user = useUser()
  if (!userId || user?.id !== userId) return null

  return (
    <>
      <Button
        className="ml-auto self-start"
        color="indigo"
        onClick={() => setOpen(true)}
      >
        Get more {ENV_CONFIG.moneyMoniker}
      </Button>
      <AddFundsModal open={open} setOpen={setOpen} />
    </>
  )
}
