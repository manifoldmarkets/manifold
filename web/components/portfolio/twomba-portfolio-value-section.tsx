'use client'
import clsx from 'clsx'
import { SPICE_TO_MANA_CONVERSION_RATE } from 'common/envs/constants'
import { Period, periodDurations } from 'common/period'
import { LivePortfolioMetrics } from 'common/portfolio-metrics'
import { last } from 'lodash'
import { ReactNode, memo, useState } from 'react'
import { AddFundsButton } from 'web/components/profile/add-funds-button'
import { SizedContainer } from 'web/components/sized-container'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { usePortfolioHistory } from 'web/hooks/use-portfolio-history'
import { User } from 'web/lib/firebase/users'
import PlaceholderGraph from 'web/lib/icons/placeholder-graph.svg'
import { PortfolioSnapshot } from 'web/lib/supabase/portfolio-history'
import { Y_AXIS_MARGIN, useZoom } from '../charts/helpers'
import { TimeRangePicker } from '../charts/time-range-picker'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { RedeemSpiceButton } from '../profile/redeem-spice-button'
import { ColorType } from '../widgets/choices-toggle-group'
import { CoinNumber } from '../widgets/manaCoinNumber'
import { PortfolioGraphNumber } from './portfolio-graph-number'
import { GraphMode, PortfolioMode } from './portfolio-value-graph'
import { ProfitWidget } from './profit-widget'
import {
  TwombaPortfolioGraph,
  TwombaProfitGraph,
} from './twomba-portfolio-graph'
import { TwombaToggle } from '../twomba/twomba-toggle'
import { Spacer } from '../layout/spacer'

export type PortfolioHoveredGraphType =
  | 'balance'
  | 'investment'
  | 'spice'
  | undefined

export type GraphValueType = {
  net?: number | null
  balance?: number | null
  invested?: number | null
  profit?: number | null
  spice?: number | null
}

export type PortfolioValueType = Required<GraphValueType>

export const emptyGraphValues = {
  net: undefined,
  balance: undefined,
  invested: undefined,
  profit: undefined,
  spice: undefined,
}

export const TwombaPortfolioValueSection = memo(
  function PortfolioValueSection(props: {
    user: User
    defaultTimePeriod: Period
    portfolio?: LivePortfolioMetrics
    hideAddFundsButton?: boolean
    onlyShowProfit?: boolean
    graphContainerClassName?: string
    size?: 'sm' | 'md'
  }) {
    const {
      user,
      hideAddFundsButton,
      defaultTimePeriod,
      portfolio,
      onlyShowProfit,
      graphContainerClassName,
      size = 'md',
    } = props
    const [currentTimePeriod, setCurrentTimePeriod] =
      useState<Period>(defaultTimePeriod)

    const portfolioHistory = usePortfolioHistory(user.id, currentTimePeriod)

    const [graphMode, setGraphMode] = useState<GraphMode>('portfolio')
    const [portfolioFocus, setPortfolioFocus] = useState<PortfolioMode>('all')

    const [graphValues, setGraphValues] =
      useState<GraphValueType>(emptyGraphValues)

    function updateGraphValues(newGraphValues: Partial<GraphValueType>): void {
      setGraphValues((prevGraphValues: GraphValueType) => {
        const updatedValues: GraphValueType = { ...prevGraphValues }
        Object.keys(newGraphValues).forEach((key) => {
          const value = newGraphValues[key as keyof GraphValueType]
          if (value === undefined) {
            updatedValues[key as keyof GraphValueType] = undefined
          } else {
            updatedValues[key as keyof GraphValueType] = value as NonNullable<
              GraphValueType[keyof GraphValueType]
            >
          }
        })
        return updatedValues
      })
    }

    const first = portfolioHistory?.[0]
    const firstProfit = first
      ? first.spiceBalance +
        first.balance +
        first.investmentValue -
        first.totalDeposits
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
      updateGraphValues(emptyGraphValues)
    }

    function noHistoryGraphElement(_width: number, height: number) {
      if (portfolioHistory) {
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
    }

    if (!portfolioHistory || !lastPortfolioMetrics) {
      return (
        <TwombaPortfolioValueSkeleton
          hideAddFundsButton={hideAddFundsButton}
          userId={user.id}
          graphMode={graphMode}
          hideSwitcher={true}
          currentTimePeriod={currentTimePeriod}
          setCurrentTimePeriod={setCurrentTimePeriod}
          className={clsx(
            portfolioHistory ? 'h-8' : '',
            graphContainerClassName
          )}
          portfolioGraphElement={noHistoryGraphElement}
          profitGraphElement={noHistoryGraphElement}
          disabled={true}
          placement={isMobile ? 'bottom' : undefined}
          size={size}
          setGraphMode={setGraphMode}
          portfolio={portfolio}
          user={user}
          portfolioFocus={portfolioFocus}
          setPortfolioFocus={onSetPortfolioFocus}
          graphValues={graphValues}
        />
      )
    }

    const { balance, investmentValue, totalDeposits, spiceBalance } =
      lastPortfolioMetrics

    const totalValue =
      balance + investmentValue + spiceBalance * SPICE_TO_MANA_CONVERSION_RATE

    const calculatedProfit = totalValue - totalDeposits - firstProfit
    const profit =
      currentTimePeriod === 'daily' && portfolio
        ? portfolio.dailyProfit
        : calculatedProfit

    const portfolioValues = {
      balance,
      invested: investmentValue,
      profit,
      net: totalValue,
      spice: spiceBalance,
    }

    // Add the latest portfolio data as the final point
    const updatedPortfolioHistory = portfolio
      ? [...portfolioHistory, portfolio]
      : portfolioHistory

    return (
      <TwombaPortfolioValueSkeleton
        hideAddFundsButton={hideAddFundsButton}
        userId={user.id}
        graphMode={graphMode}
        currentTimePeriod={currentTimePeriod}
        setCurrentTimePeriod={setTimePeriod}
        switcherColor={graphMode === 'profit' ? 'green' : 'indigo'}
        portfolioFocus={portfolioFocus}
        setPortfolioFocus={onSetPortfolioFocus}
        portfolioGraphElement={(width, height) => (
          <TwombaPortfolioGraph
            duration={currentTimePeriod}
            portfolioHistory={updatedPortfolioHistory}
            width={width}
            height={height}
            zoomParams={zoomParams}
            hideXAxis={currentTimePeriod !== 'allTime' && isMobile}
            firstProfit={firstProfit}
            updateGraphValues={updateGraphValues}
            portfolioFocus={portfolioFocus}
            setPortfolioFocus={onSetPortfolioFocus}
          />
        )}
        profitGraphElement={(width, height) => (
          <TwombaProfitGraph
            duration={currentTimePeriod}
            portfolioHistory={updatedPortfolioHistory}
            width={width}
            height={height}
            zoomParams={zoomParams}
            hideXAxis={currentTimePeriod !== 'allTime' && isMobile}
            firstProfit={firstProfit}
            updateGraphValues={updateGraphValues}
            portfolioFocus={portfolioFocus}
            setPortfolioFocus={onSetPortfolioFocus}
          />
        )}
        onlyShowProfit={onlyShowProfit}
        placement={isMobile && !onlyShowProfit ? 'bottom' : undefined}
        className={clsx(graphContainerClassName, !isMobile && 'mb-4')}
        size={size}
        portfolioValues={portfolioValues}
        graphValues={graphValues}
        setGraphMode={setGraphMode}
        portfolio={portfolio}
        user={user}
      />
    )
  }
)
function TwombaPortfolioValueSkeleton(props: {
  graphMode: GraphMode
  currentTimePeriod: Period
  setCurrentTimePeriod: (timePeriod: Period) => void
  portfolioGraphElement:
    | ((width: number, height: number) => ReactNode)
    | undefined
  profitGraphElement: ((width: number, height: number) => ReactNode) | undefined
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
  portfolio: PortfolioSnapshot | undefined
  portfolioFocus: PortfolioMode
  setPortfolioFocus: (mode: PortfolioMode) => void
  user: User
}) {
  const {
    graphMode,
    currentTimePeriod,
    setCurrentTimePeriod,
    portfolioGraphElement,
    profitGraphElement,
    hideSwitcher,
    switcherColor,
    userId,
    disabled,
    className,
    hideAddFundsButton,
    onlyShowProfit,
    size = 'md',
    portfolioValues,
    graphValues,
    setGraphMode,
    portfolioFocus,
    setPortfolioFocus,
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

  function togglePortfolioFocus(toggleTo: PortfolioMode) {
    setPortfolioFocus(portfolioFocus === toggleTo ? 'all' : toggleTo)
  }
  const [isSweepies, setIsSweepies] = useState(false)

  return (
    <Col>
      <Col
        className={clsx(
          'bg-canvas-0 border-ink-200 dark:border-ink-300 rounded-lg border-2 p-4'
        )}
      >
        <div>
          <Col className="w-full">
            <Row className="w-full justify-between gap-2">
              <Col>
                <span
                  className={clsx(
                    'cursor-pointer select-none transition-opacity',
                    portfolioFocus == 'all'
                      ? 'text-primary-700 dark:text-primary-600 opacity-100'
                      : 'text-ink-1000 opacity-50 hover:opacity-[85%]'
                  )}
                  onClick={() => togglePortfolioFocus('all')}
                >
                  <CoinNumber
                    amount={displayAmounts(
                      graphValues.net,
                      portfolioValues?.net
                    )}
                    className={clsx(
                      'text-3xl font-bold transition-all sm:text-4xl'
                    )}
                    isInline
                    coinClassName="top-[0.25rem] sm:top-[0.1rem]"
                  />
                  <span
                    className={clsx(
                      'text-ink-600 ml-1 whitespace-nowrap text-sm transition-all sm:ml-1.5 sm:text-base'
                    )}
                  >
                    net worth
                  </span>
                </span>
                <Row className="mt-2 gap-2">
                  <PortfolioGraphNumber
                    numberType={'balance'}
                    descriptor="balance"
                    portfolioFocus={portfolioFocus}
                    displayedAmount={displayAmounts(
                      graphValues.balance,
                      portfolioValues?.balance
                    )}
                    className={clsx(
                      portfolioFocus == 'balance'
                        ? 'bg-indigo-700 text-white'
                        : 'bg-canvas-50 text-ink-1000'
                    )}
                    onClick={() => togglePortfolioFocus('balance')}
                  />
                  <PortfolioGraphNumber
                    numberType={'investment'}
                    descriptor="invested"
                    portfolioFocus={portfolioFocus}
                    displayedAmount={displayAmounts(
                      graphValues.invested,
                      portfolioValues?.invested
                    )}
                    className={clsx(
                      portfolioFocus == 'investment'
                        ? 'bg-indigo-700 text-white'
                        : 'bg-canvas-50 text-ink-1000'
                    )}
                    onClick={() => togglePortfolioFocus('investment')}
                  />
                </Row>
              </Col>
              <TwombaToggle
                mode={isSweepies ? 'sweepies' : 'mana'}
                onClick={() => setIsSweepies(!isSweepies)}
              />
            </Row>
            {portfolioGraphElement && (
              <SizedContainer
                className={clsx(className, 'mt-2 h-[50px] sm:h-[80px]')}
                style={{
                  paddingRight: Y_AXIS_MARGIN,
                }}
              >
                {portfolioGraphElement}
              </SizedContainer>
            )}
          </Col>
          <Spacer h={6} />
          <Col>
            <span>
              <CoinNumber
                amount={displayAmounts(
                  graphValues.profit,
                  portfolioValues?.profit
                )}
                className={clsx(
                  'text-ink-1000 text-3xl font-bold transition-all sm:text-4xl',
                  (graphValues.profit ?? portfolioValues?.profit ?? 0) < 0
                    ? 'text-scarlet-500'
                    : 'text-teal-500'
                )}
                isInline
                coinClassName="top-[0.25rem] sm:top-[0.1rem]"
              />
              <span
                className={clsx(
                  'text-ink-600 ml-1 whitespace-nowrap text-sm transition-all sm:ml-1.5 sm:text-base'
                )}
              >
                profit
              </span>
            </span>
          </Col>
          <ProfitWidget user={user} portfolio={portfolio} />
          {profitGraphElement && (
            <SizedContainer
              className={clsx(className, 'mt-2 h-[50px] sm:h-[80px]')}
              style={{
                paddingRight: Y_AXIS_MARGIN,
              }}
            >
              {profitGraphElement}
            </SizedContainer>
          )}
        </div>
        {!hideSwitcher && !!portfolioGraphElement && (
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
      {!hideAddFundsButton && (
        <Row className="mt-4 w-full gap-1 sm:gap-2">
          <AddFundsButton userId={userId} className="w-1/2 whitespace-nowrap" />
          <RedeemSpiceButton
            userId={userId}
            className="w-1/2 whitespace-nowrap"
            spice={portfolioValues?.spice}
          />
        </Row>
      )}
    </Col>
  )
}

function displayAmounts(
  graphNumber: number | null | undefined,
  currentNumber: number | null | undefined
): number | undefined {
  if (graphNumber === undefined) {
    return currentNumber ?? undefined
  }
  return graphNumber ?? undefined
}
