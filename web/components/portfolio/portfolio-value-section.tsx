import clsx from 'clsx'
import { formatMoney } from 'common/util/format'
import { last } from 'lodash'
import { memo, ReactNode, useState } from 'react'
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

export const PortfolioValueSection = memo(
  function PortfolioValueSection(props: { userId: string }) {
    const { userId } = props
    const [currentTimePeriod, setCurrentTimePeriod] = useState<Period>('weekly')
    const portfolioHistory = usePortfolioHistory(userId, currentTimePeriod)
    const [graphMode, setGraphMode] = useState<GraphMode>('profit')
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
    if (!portfolioHistory || !lastPortfolioMetrics) {
      return (
        <PortfolioValueSkeleton
          userId={userId}
          graphMode={graphMode}
          onClickNumber={onClickNumber}
          currentTimePeriod={currentTimePeriod}
          setCurrentTimePeriod={setCurrentTimePeriod}
          profitElement={
            <div className="text-greyscale-5 animate-pulse text-lg sm:text-xl">
              ---
            </div>
          }
          valueElement={
            <div className="text-greyscale-5 animate-pulse text-lg sm:text-xl">
              ---
            </div>
          }
          graphElement={(width, height) => (
            <div
              style={{
                height: `${height - 40}px`,
                margin: '20px 70px 20px 10px',
              }}
            >
              <PlaceholderGraph className="text-greyscale-4 h-full w-full animate-pulse" />
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
            history={portfolioHistory}
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
          <div className="text-greyscale-6 text-xs sm:text-sm">Profit</div>
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
          <div className="text-greyscale-6 text-xs sm:text-sm">
            Portfolio value
          </div>
          {valueElement}
        </Col>

        <AddFundsButton userId={userId} />
      </Row>
      <SizedContainer fullHeight={200} mobileHeight={100}>
        {graphElement}
      </SizedContainer>
      <PortfolioTimeSelection
        currentTimePeriod={currentTimePeriod}
        setCurrentTimePeriod={setCurrentTimePeriod}
        disabled={disabled}
      />
    </>
  )
}

export function PortfolioTimeSelection(props: {
  currentTimePeriod: Period
  setCurrentTimePeriod: (timePeriod: Period) => void
  disabled?: boolean
}) {
  const { currentTimePeriod, setCurrentTimePeriod, disabled } = props
  return (
    <>
      <Row
        className={clsx(
          'text-greyscale-4 z-10 mt-1 gap-3',
          disabled ? 'pointer-events-none' : ''
        )}
      >
        <TimeSelectionButton
          timePeriod={'daily'}
          currentTimePeriod={currentTimePeriod}
          setCurrentTimePeriod={setCurrentTimePeriod}
          symbol={'1D'}
        />
        <TimeSelectionButton
          timePeriod={'weekly'}
          currentTimePeriod={currentTimePeriod}
          setCurrentTimePeriod={setCurrentTimePeriod}
          symbol={'1W'}
        />
        <TimeSelectionButton
          timePeriod={'monthly'}
          currentTimePeriod={currentTimePeriod}
          setCurrentTimePeriod={setCurrentTimePeriod}
          symbol={'1M'}
        />
        <TimeSelectionButton
          timePeriod={'allTime'}
          currentTimePeriod={currentTimePeriod}
          setCurrentTimePeriod={setCurrentTimePeriod}
          symbol={'ALL'}
        />
      </Row>
      <hr className="z-0 mt-[2.5px]" />
    </>
  )
}

export function TimeSelectionButton(props: {
  timePeriod: Period
  currentTimePeriod: Period
  setCurrentTimePeriod: (timePeriod: Period) => void
  symbol: string
}) {
  const { timePeriod, currentTimePeriod, setCurrentTimePeriod, symbol } = props
  return (
    <button
      className={clsx(
        currentTimePeriod === timePeriod
          ? 'text-indigo-500 underline decoration-2 underline-offset-8'
          : ''
      )}
      onClick={() => setCurrentTimePeriod(timePeriod)}
    >
      {symbol}
    </button>
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
        color="gray-outline"
        onClick={() => setOpen(true)}
      >
        Add {ENV_CONFIG.moneyMoniker}
      </Button>
      <AddFundsModal open={open} setOpen={setOpen} />
    </>
  )
}
