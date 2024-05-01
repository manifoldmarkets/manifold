'use client'
import clsx from 'clsx'
import { AnyBalanceChangeType } from 'common/balance-change'
import { last } from 'lodash'
import { ReactNode, memo, useMemo, useState } from 'react'
import { AddFundsButton } from 'web/components/profile/add-funds-button'
import { SizedContainer } from 'web/components/sized-container'
import { useEvent } from 'web/hooks/use-event'
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
import { Spacer } from '../layout/spacer'
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

    const [graphBalance, setGraphBalance] = useState<number | undefined>(
      undefined
    )
    const [graphInvested, setGraphInvested] = useState<number | undefined>(
      undefined
    )

    const [graphProfit, setGraphProfit] = useState<number | undefined>(
      undefined
    )

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
      setGraphBalance(undefined)
      setGraphInvested(undefined)
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
        />
      )
    }

    const { balance, investmentValue, totalDeposits } = lastPortfolioMetrics
    const totalValue = balance + investmentValue

    const profit = totalValue - totalDeposits - firstProfit
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
            setGraphBalance={setGraphBalance}
            setGraphInvested={setGraphInvested}
            setGraphProfit={setGraphProfit}
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
        balance={balance}
        profit={profit}
        invested={investmentValue}
        graphBalance={graphBalance}
        graphProfit={graphProfit}
        graphInvested={graphInvested}
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
  balance?: number
  profit?: number
  invested?: number
  graphBalance?: number
  graphProfit?: number
  graphInvested?: number
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
    balance,
    profit,
    invested,
    graphBalance,
    graphProfit,
    graphInvested,
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
              amount={balance}
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
              amount={profit}
              className="text-primary-600 text-xs sm:text-sm"
              numberType="short"
            />
          </PortfolioTab>
        </Row>
        {!hideAddFundsButton && (
          <AddFundsButton
            userId={userId}
            className=" hidden self-center whitespace-nowrap sm:flex"
          />
        )}
      </Row>
      <Col
        className={clsx(
          'bg-canvas-0 border-ink-200 dark:border-ink-300 rounded-b-lg border-2 p-4 sm:rounded-lg sm:rounded-tl-none'
        )}
      >
        <Row className={clsx('justify-between gap-0')}>
          <div>
            {graphMode == 'portfolio' && (
              <>
                <PortfolioGraphNumber
                  numberType={'investment'}
                  descriptor="invested"
                  portfolioFocus={portfolioFocus}
                  portfolioHoveredGraph={portfolioHoveredGraph}
                  displayedAmount={graphInvested ?? invested}
                  color={INVESTMENT_COLOR}
                  onClick={() => togglePortfolioFocus('investment')}
                />
                <PortfolioGraphNumber
                  numberType={'balance'}
                  descriptor="balance"
                  portfolioFocus={portfolioFocus}
                  portfolioHoveredGraph={portfolioHoveredGraph}
                  displayedAmount={graphBalance ?? balance}
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
                <BalanceWidget balanceChanges={balanceChanges} />
              </>
            )}
            {graphMode == 'profit' && (
              <>
                <CoinNumber
                  amount={graphProfit ?? profit}
                  className={clsx(
                    'text-2xl transition-colors sm:text-4xl',
                    (graphProfit ?? profit ?? 0) < 0
                      ? 'text-scarlet-500'
                      : 'text-teal-500'
                  )}
                />
                <ProfitWidget user={user} portfolio={portfolio} />
              </>
            )}
          </div>

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
          {!hideAddFundsButton && (
            <Col>
              <AddFundsButton
                userId={userId}
                className=" self-center whitespace-nowrap sm:hidden"
              />
            </Col>
          )}
        </Row>
        <SizedContainer
          className={clsx(
            className,
            'pr-11 lg:pr-0',
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
