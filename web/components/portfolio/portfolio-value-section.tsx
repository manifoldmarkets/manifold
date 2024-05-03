'use client'
import clsx from 'clsx'
import { AnyBalanceChangeType } from 'common/balance-change'
import { last } from 'lodash'
import { ReactNode, memo, useState } from 'react'
import { AddFundsButton } from 'web/components/profile/add-funds-button'
import { SizedContainer } from 'web/components/sized-container'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import {
  PeriodToSnapshots,
  usePortfolioHistory,
} from 'web/hooks/use-portfolio-history'
import { Period, User } from 'web/lib/firebase/users'
import PlaceholderGraph from 'web/lib/icons/placeholder-graph.svg'
import { PortfolioSnapshot } from 'web/lib/supabase/portfolio-history'
import { periodDurations } from 'web/lib/util/time'
import { useZoom } from '../charts/helpers'
import { TimeRangePicker } from '../charts/time-range-picker'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { ColorType } from '../widgets/choices-toggle-group'
import { CoinNumber } from '../widgets/manaCoinNumber'
import { BalanceWidget } from './balance-widget'
import { PortfolioTab } from './portfolio-tabs'
import {
  BALANCE_COLOR,
  GraphMode,
  INVESTMENT_COLOR,
  PortfolioGraph,
  PortfolioMode,
} from './portfolio-value-graph'
import { ProfitWidget } from './profit-widget'
import { SPICE_PRODUCTION_ENABLED } from 'common/envs/constants'
import { RedeemSpiceButton } from '../profile/redeem-spice-button'
import { PortfolioGraphNumber } from './portfolio-graph-number'

export type PortfolioHoveredGraphType = 'balance' | 'investment' | undefined

export type GraphValueType = {
  net?: number
  balance?: number
  invested?: number
  profit?: number
}

export type PortfolioValueType = Required<GraphValueType>

export const emptyGraphValues = {
  net: undefined,
  balance: undefined,
  invested: undefined,
  profit: undefined,
}

export const PortfolioValueSection = memo(
  function PortfolioValueSection(props: {
    currentUser: User | null | undefined
    user: User
    defaultTimePeriod: Period
    portfolio?: PortfolioSnapshot
    hideAddFundsButton?: boolean
    onlyShowProfit?: boolean
    graphContainerClassName?: string
    preloadPoints?: PeriodToSnapshots
    size?: 'sm' | 'md'
    balanceChanges: AnyBalanceChangeType[]
  }) {
    const {
      user,
      hideAddFundsButton,
      defaultTimePeriod,
      portfolio,
      onlyShowProfit,
      graphContainerClassName,
      preloadPoints,
      size = 'md',
      balanceChanges,
      currentUser,
    } = props
    const [currentTimePeriod, setCurrentTimePeriod] =
      useState<Period>(defaultTimePeriod)
    const portfolioHistory = usePortfolioHistory(user.id, currentTimePeriod)

    const [graphMode, setGraphMode] = useState<GraphMode>('portfolio')
    const [portfolioFocus, setPortfolioFocus] = useState<PortfolioMode>('all')

    const [graphValues, setGraphValues] =
      useState<GraphValueType>(emptyGraphValues)

    function updateGraphValues(newGraphValues: GraphValueType) {
      setGraphValues((graphValues) => ({ ...graphValues, ...newGraphValues }))
    }

    const [portfolioHoveredGraph, setPortfolioHoveredGraph] =
      useState<PortfolioHoveredGraphType>(undefined)

    const first = portfolioHistory?.[0]
    const firstProfit = first
      ? first.balance + first.investmentValue - first.totalDeposits
      : 0

    const lastPortfolioMetrics = portfolio ?? last(portfolioHistory)

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

    function onSetPortfolioFocus(mode: PortfolioMode) {
      setPortfolioFocus(mode)
      setPortfolioHoveredGraph(undefined)
      updateGraphValues(emptyGraphValues)
    }

    if (!portfolioHistory || !lastPortfolioMetrics) {
      const showDisclaimer = portfolioHistory
      return (
        <PortfolioValueSkeleton
          hideAddFundsButton={hideAddFundsButton}
          userId={user.id}
          graphMode={graphMode}
          hideSwitcher={true}
          currentTimePeriod={currentTimePeriod}
          setCurrentTimePeriod={setCurrentTimePeriod}
          className={clsx(showDisclaimer ? 'h-8' : '', graphContainerClassName)}
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
          size={size}
          setGraphMode={setGraphMode}
          balanceChanges={balanceChanges}
          portfolio={portfolio}
          user={user}
          portfolioFocus={portfolioFocus}
          setPortfolioFocus={onSetPortfolioFocus}
          graphValues={graphValues}
        />
      )
    }

    const { balance, investmentValue, totalDeposits } = lastPortfolioMetrics
    const totalValue = balance + investmentValue

    const profit = totalValue - totalDeposits - firstProfit

    const portfolioValues = {
      balance,
      invested: investmentValue,
      profit,
      net: totalValue,
    }

    return (
      <PortfolioValueSkeleton
        hideAddFundsButton={hideAddFundsButton}
        userId={user.id}
        graphMode={graphMode}
        currentTimePeriod={currentTimePeriod}
        setCurrentTimePeriod={setTimePeriod}
        switcherColor={graphMode === 'profit' ? 'green' : 'indigo'}
        portfolioFocus={portfolioFocus}
        setPortfolioFocus={onSetPortfolioFocus}
        portfolioHoveredGraph={portfolioHoveredGraph}
        graphElement={(width, height) => (
          <PortfolioGraph
            mode={graphMode}
            duration={currentTimePeriod}
            portfolioHistory={portfolioHistory}
            width={width}
            height={height}
            zoomParams={zoomParams}
            hideXAxis={currentTimePeriod !== 'allTime' && isMobile}
            firstProfit={firstProfit}
            updateGraphValues={updateGraphValues}
            portfolioFocus={portfolioFocus}
            setPortfolioFocus={onSetPortfolioFocus}
            portfolioHoveredGraph={portfolioHoveredGraph}
            setPortfolioHoveredGraph={setPortfolioHoveredGraph}
          />
        )}
        onlyShowProfit={onlyShowProfit}
        placement={isMobile && !onlyShowProfit ? 'bottom' : undefined}
        className={clsx(graphContainerClassName, !isMobile && 'mb-4')}
        size={size}
        portfolioValues={portfolioValues}
        graphValues={graphValues}
        setGraphMode={setGraphMode}
        balanceChanges={balanceChanges}
        portfolio={undefined}
        user={user}
      />
    )
  }
)

function PortfolioValueSkeleton(props: {
  graphMode: GraphMode
  currentTimePeriod: Period
  setCurrentTimePeriod: (timePeriod: Period) => void
  graphElement: (width: number, height: number) => ReactNode
  hideSwitcher?: boolean
  className?: string
  switcherColor?: ColorType
  userId?: string
  disabled?: boolean
  placement?: 'bottom'
  hideAddFundsButton?: boolean
  onlyShowProfit?: boolean
  size?: 'sm' | 'md'
  portfolioValues?: PortfolioValueType
  graphValues: GraphValueType
  setGraphMode: (mode: GraphMode) => void
  balanceChanges: AnyBalanceChangeType[]
  portfolio: PortfolioSnapshot | undefined
  portfolioFocus: PortfolioMode
  setPortfolioFocus: (mode: PortfolioMode) => void
  user: User
  portfolioHoveredGraph?: PortfolioHoveredGraphType
}) {
  const {
    graphMode,
    currentTimePeriod,
    setCurrentTimePeriod,
    graphElement,
    hideSwitcher,
    switcherColor,
    userId,
    disabled,
    placement,
    className,
    hideAddFundsButton,
    onlyShowProfit,
    size = 'md',
    portfolioValues,
    graphValues,
    setGraphMode,
    balanceChanges,
    portfolioFocus,
    setPortfolioFocus,
    portfolio,
    user,
    portfolioHoveredGraph,
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

  function togglePortfolioFocus(toggleTo: PortfolioMode) {
    setPortfolioFocus(portfolioFocus === toggleTo ? 'all' : toggleTo)
  }

  return (
    <Col>
      <Row className="justify-between">
        <Row className={clsx('grow items-start gap-0')}>
          <PortfolioTab
            onClick={() => setGraphMode('portfolio')}
            isSelected={graphMode == 'portfolio'}
            title="Portfolio"
          >
            <CoinNumber
              amount={portfolioValues?.net}
              className="text-primary-600 text-xs sm:text-sm"
              numberType="short"
            />
          </PortfolioTab>

          <PortfolioTab
            onClick={() => setGraphMode('profit')}
            isSelected={graphMode == 'profit'}
            title={profitLabel}
          >
            <CoinNumber
              amount={portfolioValues?.profit}
              className="text-primary-600 text-xs sm:text-sm"
              numberType="short"
            />
          </PortfolioTab>
        </Row>
      </Row>
      <Col
        className={clsx(
          'bg-canvas-0 border-ink-200 dark:border-ink-300 rounded-b-lg border-2 p-4 sm:rounded-lg sm:rounded-tl-none'
        )}
      >
        <div>
          {graphMode == 'portfolio' && (
            <Col className="w-full">
              <Row className="w-full justify-between">
                <Row className="w-full justify-between gap-2 sm:justify-start">
                  <span
                    className={clsx(
                      'group cursor-pointer select-none transition-opacity',
                      portfolioFocus == 'all'
                        ? 'opacity-100'
                        : 'hover:opacity-85 opacity-50'
                    )}
                    onClick={() => togglePortfolioFocus('all')}
                  >
                    <CoinNumber
                      amount={graphValues.net ?? portfolioValues?.net}
                      className={clsx(
                        'text-ink-1000 text-2xl font-bold transition-all sm:text-4xl'
                      )}
                      isInline
                      coinClassName="top-[0.25rem] sm:top-[0.1rem]"
                    />
                    <span
                      className={clsx(
                        'text-ink-600 group-hover:text-ink-700  ml-1 whitespace-nowrap text-sm transition-all sm:text-base'
                      )}
                    >
                      net worth
                    </span>
                  </span>
                  {!hideAddFundsButton && (
                    <AddFundsButton
                      userId={userId}
                      className="mt-1 h-fit whitespace-nowrap sm:mt-2"
                    />
                  )}
                </Row>
                {!placement && !hideSwitcher && (
                  <TimeRangePicker
                    currentTimePeriod={currentTimePeriod}
                    setCurrentTimePeriod={setCurrentTimePeriod}
                    color={switcherColor}
                    disabled={disabled}
                    className="bg-canvas-50 ml-auto h-fit border-0"
                    toggleClassName={'w-12 justify-center'}
                  />
                )}
              </Row>
              <Row className="mt-2 gap-2">
                <PortfolioGraphNumber
                  numberType={'investment'}
                  descriptor="invested"
                  portfolioFocus={portfolioFocus}
                  portfolioHoveredGraph={portfolioHoveredGraph}
                  displayedAmount={
                    graphValues.invested ?? portfolioValues?.invested
                  }
                  color={INVESTMENT_COLOR}
                  onClick={() => togglePortfolioFocus('investment')}
                />
                <PortfolioGraphNumber
                  numberType={'balance'}
                  descriptor="balance"
                  portfolioFocus={portfolioFocus}
                  portfolioHoveredGraph={portfolioHoveredGraph}
                  displayedAmount={
                    graphValues.balance ?? portfolioValues?.balance
                  }
                  color={BALANCE_COLOR}
                  onClick={() => togglePortfolioFocus('balance')}
                />
                {SPICE_PRODUCTION_ENABLED && (
                  <Row className="mt-1 items-center gap-3">
                    <CoinNumber amount={user.spiceBalance} isSpice={true} />
                    {!hideAddFundsButton && (
                      <RedeemSpiceButton
                        userId={userId}
                        className=" self-center whitespace-nowrap"
                      />
                    )}
                  </Row>
                )}
              </Row>
              {/* <BalanceWidget
                balanceChanges={balanceChanges}
                className="w-fit"
              /> */}
            </Col>
          )}
          {graphMode == 'profit' && (
            <>
              <CoinNumber
                amount={graphValues.profit ?? portfolioValues?.profit}
                className={clsx(
                  'text-2xl transition-colors sm:text-4xl',
                  (graphValues.profit ?? portfolioValues?.profit ?? 0) < 0
                    ? 'text-scarlet-500'
                    : 'text-teal-500'
                )}
              />
              <ProfitWidget user={user} portfolio={portfolio} />
            </>
          )}
        </div>
        <SizedContainer
          className={clsx(
            className,
            'mt-2 pr-11',
            size == 'sm' ? 'h-[80px] sm:h-[100px]' : 'h-[125px] sm:h-[200px]'
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
            className="bg-canvas-50 mt-8 border-0"
            toggleClassName="grow justify-center"
          />
        )}
      </Col>
    </Col>
  )
}
