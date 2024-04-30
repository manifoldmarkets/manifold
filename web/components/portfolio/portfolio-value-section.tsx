'use client'
import clsx from 'clsx'
import { AnyBalanceChangeType } from 'common/balance-change'
import { last } from 'lodash'
import { ReactNode, memo, useMemo, useState } from 'react'
import { AddFundsButton } from 'web/components/profile/add-funds-button'
import { SizedContainer } from 'web/components/sized-container'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { usePortfolioHistory } from 'web/hooks/use-portfolio-history'
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
import { GraphMode, PortfolioGraph } from './portfolio-value-graph'
import { ProfitWidget } from './profit-widget'
import { SPICE_PRODUCTION_ENABLED } from 'common/envs/constants'
import { RedeemSpiceButton } from '../profile/redeem-spice-button'

export const PortfolioValueSection = memo(
  function PortfolioValueSection(props: {
    user: User
    currentUser: User | null | undefined
    defaultTimePeriod: Period
    portfolio?: PortfolioSnapshot
    hideAddFundsButton?: boolean
    onlyShowProfit?: boolean
    graphContainerClassName?: string
    size?: 'sm' | 'md'
    balanceChanges: AnyBalanceChangeType[]
  }) {
    const {
      user,
      currentUser,
      hideAddFundsButton,
      defaultTimePeriod,
      portfolio,
      onlyShowProfit,
      graphContainerClassName,
      size = 'md',
      balanceChanges,
    } = props
    const [currentTimePeriod, setCurrentTimePeriod] =
      useState<Period>(defaultTimePeriod)
    const portfolioHistory = usePortfolioHistory(user.id, currentTimePeriod)
    const [graphMode, setGraphMode] = useState<GraphMode>(
      currentUser?.id === user.id ? 'balance' : 'profit'
    )

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
            : graphMode === 'invested'
            ? p.investmentValue
            : p.balance + p.investmentValue - p.totalDeposits - firstProfit,
        obj: p,
      }))
    }, [portfolioHistory, graphMode])

    const [graphDisplayNumber, setGraphDisplayNumber] = useState<number | null>(
      null
    )
    const handleGraphDisplayChange = (p: { y: number } | undefined) => {
      setGraphDisplayNumber(p != null ? p.y : null)
    }
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
    const { balance, investmentValue, totalDeposits } =
      lastPortfolioMetrics ?? {
        balance: user.balance,
        investmentValue: 0,
        totalDeposits: 0,
      }
    const totalValue = balance + investmentValue
    const profit = totalValue - totalDeposits - firstProfit
    if (!portfolioHistory || graphPoints.length <= 1 || !lastPortfolioMetrics) {
      const showDisclaimer = portfolioHistory

      return (
        <PortfolioValueSkeleton
          balance={balance}
          profit={profit}
          invested={investmentValue}
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
          graphDisplayNumber={graphDisplayNumber}
          balanceChanges={balanceChanges}
          portfolio={portfolio}
          user={user}
        />
      )
    }

    return (
      <PortfolioValueSkeleton
        hideAddFundsButton={hideAddFundsButton}
        userId={user.id}
        graphMode={graphMode}
        currentTimePeriod={currentTimePeriod}
        setCurrentTimePeriod={setTimePeriod}
        switcherColor={
          graphMode === 'profit'
            ? 'green'
            : graphMode === 'balance'
            ? 'indigo'
            : 'indigo-dark'
        }
        graphElement={(width, height) => (
          <PortfolioGraph
            mode={graphMode}
            duration={currentTimePeriod}
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
        className={clsx(graphContainerClassName, !isMobile && 'mb-4')}
        size={size}
        balance={balance}
        profit={profit}
        invested={investmentValue}
        setGraphMode={setGraphMode}
        graphDisplayNumber={graphDisplayNumber}
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
  setGraphMode: (mode: GraphMode) => void
  graphDisplayNumber: number | null
  balanceChanges: AnyBalanceChangeType[]
  portfolio: PortfolioSnapshot | undefined
  user: User
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
    setGraphMode,
    graphDisplayNumber,
    balanceChanges,
    portfolio,
    user,
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

  const currentGraphNumber =
    graphMode === 'profit'
      ? profit
      : graphMode === 'balance'
      ? balance
      : invested
  return (
    <Col>
      <Row>
        <Row className={clsx('grow items-start gap-0')}>
          <PortfolioTab
            onClick={() => setGraphMode('balance')}
            isSelected={graphMode == 'balance'}
            title="Balance"
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

          <PortfolioTab
            onClick={() => setGraphMode('invested')}
            isSelected={graphMode == 'invested'}
            title="Invested"
          >
            <CoinNumber
              amount={invested}
              className="text-primary-600 text-xs sm:text-sm"
              numberType="short"
            />
          </PortfolioTab>
        </Row>
      </Row>
      <Col
        className={clsx(
          'bg-canvas-0 border-ink-200 dark:border-ink-300 rounded-b-lg border-2 p-4 sm:rounded-lg sm:rounded-tl-none',
          graphMode == 'invested' ? 'rounded-tr-none sm:rounded-lg' : ''
        )}
      >
        <Row className={clsx('items-start gap-0')}>
          <div className={'text-ink-800 text-4xl'}>
            <Row className="flex-wrap items-center gap-3">
              <CoinNumber amount={graphDisplayNumber ?? currentGraphNumber} />
              {!hideAddFundsButton && graphMode == 'balance' && (
                <AddFundsButton
                  userId={userId}
                  className=" self-center whitespace-nowrap"
                />
              )}
            </Row>
            {graphMode == 'balance' && (
              <>
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
              <ProfitWidget user={user} portfolio={portfolio} />
            )}
            {graphMode == 'invested' && <Spacer h={10} />}
          </div>

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
            className="bg-canvas-50 mt-1 border-0"
            toggleClassName="grow justify-center"
          />
        )}
      </Col>
    </Col>
  )
}
