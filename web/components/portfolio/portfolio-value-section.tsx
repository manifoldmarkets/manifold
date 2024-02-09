'use client'
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
import PlaceholderGraph from 'web/lib/icons/placeholder-graph.svg'
import { TimeRangePicker } from '../charts/time-range-picker'
import { ColorType } from '../widgets/choices-toggle-group'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { track } from 'web/lib/service/analytics'
import { useZoom } from '../charts/helpers'
import { periodDurations } from 'web/lib/util/time'
import { AddFundsButton } from 'web/components/profile/add-funds-button'

export const PortfolioValueSection = memo(
  function PortfolioValueSection(props: {
    userId: string
    defaultTimePeriod: Period
    isCurrentUser: boolean
    lastUpdatedTime: number | undefined
    hideAddFundsButton?: boolean
    onlyShowProfit?: boolean
  }) {
    const {
      userId,
      hideAddFundsButton,
      defaultTimePeriod,
      lastUpdatedTime,
      onlyShowProfit,
    } = props
    const [currentTimePeriod, setCurrentTimePeriod] =
      useState<Period>(defaultTimePeriod)
    const portfolioHistory = usePortfolioHistory(userId, currentTimePeriod)
    const [graphMode, setGraphMode] = useState<GraphMode>('profit')

    const first = portfolioHistory?.[0]
    const firstProfit = first
      ? first.balance + first.investmentValue - first.totalDeposits
      : 0

    const graphPoints = useMemo(() => {
      if (!portfolioHistory?.length) return []

      return portfolioHistory.map((p) => ({
        x: p.timestamp,
        y:
          graphMode === 'balance'
            ? p.balance
            : graphMode === 'value'
            ? p.balance + p.investmentValue
            : p.balance + p.investmentValue - p.totalDeposits - firstProfit,
        obj: p,
      }))
    }, [portfolioHistory, graphMode])

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

    const zoomParams = useZoom()

    const setTimePeriod = (period: Period) => {
      if (period === 'allTime') {
        zoomParams.rescale(null)
      } else {
        const time = periodDurations[period]
        const end = Date.now()
        const start = end - time
        zoomParams.rescaleBetween(start, end)
      }
      setCurrentTimePeriod(period)
    }

    const isMobile = useIsMobile()

    const placeholderSection = (
      <div className="text-ink-500 animate-pulse text-lg sm:text-xl">---</div>
    )

    if (
      !portfolioHistory ||
      graphPoints.length <= 1 ||
      !lastUpdatedTime ||
      !lastPortfolioMetrics
    ) {
      const showDisclaimer = portfolioHistory || !lastUpdatedTime
      return (
        <PortfolioValueSkeleton
          hideAddFundsButton={hideAddFundsButton}
          userId={userId}
          graphMode={graphMode}
          onClickNumber={onClickNumber}
          hideSwitcher={true}
          currentTimePeriod={currentTimePeriod}
          setCurrentTimePeriod={setCurrentTimePeriod}
          profitElement={placeholderSection}
          balanceElement={!onlyShowProfit ? placeholderSection : undefined}
          valueElement={!onlyShowProfit ? placeholderSection : undefined}
          className={showDisclaimer ? 'h-8' : ''}
          graphElement={(_width, height) => {
            if (showDisclaimer) {
              return (
                <Col className={'text-ink-500 mt-2'}>
                  <Row className={'gap-2'}>
                    <span>No portfolio history, yet.</span>
                  </Row>
                </Col>
              )
            }
            return (
              <div
                style={{
                  height: `${height - 40}px`,
                  margin: '20px 70px 20px 10px',
                }}
              >
                <PlaceholderGraph className="text-ink-400 h-full w-full animate-pulse" />
              </div>
            )
          }}
          disabled={true}
          placement={isMobile ? 'bottom' : undefined}
        />
      )
    }

    const { balance, investmentValue, totalDeposits } = lastPortfolioMetrics
    const totalValue = balance + investmentValue

    const profit = totalValue - totalDeposits - firstProfit
    return (
      <PortfolioValueSkeleton
        hideAddFundsButton={hideAddFundsButton}
        userId={userId}
        graphMode={graphMode}
        onClickNumber={onClickNumber}
        currentTimePeriod={currentTimePeriod}
        setCurrentTimePeriod={setTimePeriod}
        switcherColor={
          graphMode === 'profit'
            ? 'green'
            : graphMode === 'balance'
            ? 'indigo'
            : 'indigo-dark'
        }
        profitElement={
          <div
            className={clsx(
              graphMode === 'profit' && graphDisplayNumber
                ? graphDisplayNumber.toString().includes('-')
                  ? 'text-scarlet-500'
                  : 'text-teal-500'
                : profit <= -1
                ? 'text-scarlet-500'
                : 'text-teal-500',
              'text-lg sm:text-xl'
            )}
          >
            {graphMode === 'profit' && graphDisplayNumber
              ? graphDisplayNumber
              : formatMoney(profit)}
          </div>
        }
        balanceElement={
          !onlyShowProfit ? (
            <div className={clsx('text-lg text-blue-600 sm:text-xl')}>
              {graphMode === 'balance' && graphDisplayNumber
                ? graphDisplayNumber
                : formatMoney(balance)}
            </div>
          ) : undefined
        }
        valueElement={
          !onlyShowProfit ? (
            <div className={clsx('text-primary-600 text-lg sm:text-xl')}>
              {graphMode === 'value' && graphDisplayNumber
                ? graphDisplayNumber
                : formatMoney(totalValue)}
            </div>
          ) : undefined
        }
        graphElement={(width, height) => (
          <PortfolioGraph
            key={graphMode} // we need to reset axis scale state if mode changes
            mode={graphMode}
            points={graphPoints}
            width={width}
            height={height}
            zoomParams={zoomParams}
            onMouseOver={handleGraphDisplayChange}
            hideXAxis={currentTimePeriod !== 'allTime' && isMobile}
          />
        )}
        onlyShowProfit={onlyShowProfit}
        placement={isMobile && !onlyShowProfit ? 'bottom' : undefined}
      />
    )
  }
)

function PortfolioValueSkeleton(props: {
  graphMode: GraphMode
  onClickNumber: (mode: GraphMode) => void
  currentTimePeriod: Period
  setCurrentTimePeriod: (timePeriod: Period) => void
  valueElement?: ReactNode
  profitElement: ReactNode
  balanceElement?: ReactNode
  graphElement: (width: number, height: number) => ReactNode
  hideSwitcher?: boolean
  className?: string
  switcherColor?: ColorType
  userId?: string
  disabled?: boolean
  placement?: 'bottom'
  hideAddFundsButton?: boolean
  onlyShowProfit?: boolean
}) {
  const {
    graphMode,
    onClickNumber,
    currentTimePeriod,
    setCurrentTimePeriod,
    valueElement,
    profitElement,
    balanceElement,
    graphElement,
    hideSwitcher,
    switcherColor,
    userId,
    disabled,
    placement,
    className,
    hideAddFundsButton,
    onlyShowProfit,
  } = props

  const profitLabel = onlyShowProfit
    ? {
        daily: 'Daily profit',
        weekly: 'Weekly profit',
        monthly: 'Monthly profit',
        allTime: 'All-time profit',
      }[currentTimePeriod]
    : {
        daily: 'Profit 1D',
        weekly: 'Profit 1W',
        monthly: 'Profit 1M',
        allTime: 'Profit',
      }[currentTimePeriod]

  return (
    <>
      <Row className={clsx('mb-1 items-start gap-0 sm:mb-2')}>
        <Col
          className={clsx(
            'w-24 cursor-pointer sm:w-28 ',
            !balanceElement && !valueElement ? 'ml-3 sm:ml-2' : '',
            graphMode != 'profit'
              ? 'cursor-pointer opacity-40 hover:opacity-80'
              : ''
          )}
          onClick={() => {
            onClickNumber('profit')
            track('Trading Profits Clicked')
          }}
        >
          <div className="text-ink-600 text-xs sm:text-sm">{profitLabel}</div>
          {profitElement}
        </Col>

        {valueElement && (
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
            <div className="text-ink-600 text-xs sm:text-sm">Net worth</div>
            {valueElement}
          </Col>
        )}

        {balanceElement && (
          <Col
            className={clsx(
              'w-24 cursor-pointer sm:w-28 ',
              graphMode != 'balance'
                ? 'cursor-pointer opacity-40 hover:opacity-80'
                : ''
            )}
            onClick={() => {
              onClickNumber('balance')
              track('Graph Balance Clicked')
            }}
          >
            <div className="text-ink-600 text-xs sm:text-sm">Balance</div>
            {balanceElement}
          </Col>
        )}

        {!hideAddFundsButton && (
          <AddFundsButton
            userId={userId}
            className=" self-center whitespace-nowrap"
          />
        )}

        {!placement && !hideSwitcher && (
          <TimeRangePicker
            currentTimePeriod={currentTimePeriod}
            setCurrentTimePeriod={setCurrentTimePeriod}
            color={switcherColor}
            disabled={disabled}
            className="bg-canvas-50 ml-auto border-0"
            toggleClassName={'w-12 justify-center'}
          />
        )}
      </Row>
      <SizedContainer
        className={clsx(
          className ? className : 'mb-4 h-[150px] pr-11 sm:h-[200px] lg:pr-0'
        )}
      >
        {graphElement}
      </SizedContainer>
      {placement === 'bottom' && !hideSwitcher && (
        <TimeRangePicker
          currentTimePeriod={currentTimePeriod}
          setCurrentTimePeriod={setCurrentTimePeriod}
          color={switcherColor}
          disabled={disabled}
          className="bg-canvas-50 mt-1 border-0"
          toggleClassName="grow justify-center"
        />
      )}
    </>
  )
}
