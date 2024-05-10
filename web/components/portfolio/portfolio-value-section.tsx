'use client'
import clsx from 'clsx'
import { last } from 'lodash'
import { ReactNode, memo, useState } from 'react'
import { AddFundsButton } from 'web/components/profile/add-funds-button'
import { SizedContainer } from 'web/components/sized-container'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { Period, periodDurations } from 'common/period'
import { User } from 'web/lib/firebase/users'
import PlaceholderGraph from 'web/lib/icons/placeholder-graph.svg'
import { PortfolioSnapshot } from 'web/lib/supabase/portfolio-history'
import { Y_AXIS_MARGIN, useZoom } from '../charts/helpers'
import { TimeRangePicker } from '../charts/time-range-picker'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { ColorType } from '../widgets/choices-toggle-group'
import { CoinNumber } from '../widgets/manaCoinNumber'
import { PortfolioTab } from './portfolio-tabs'
import {
  BALANCE_COLOR,
  GraphMode,
  INVESTMENT_COLOR,
  PortfolioGraph,
  PortfolioMode,
  SPICE_COLOR,
} from './portfolio-value-graph'
import { ProfitWidget } from './profit-widget'
import {
  SPICE_NAME,
  SPICE_PRODUCTION_ENABLED,
  SPICE_TO_MANA_CONVERSION_RATE,
} from 'common/envs/constants'
import { RedeemSpiceButton } from '../profile/redeem-spice-button'
import { PortfolioGraphNumber } from './portfolio-graph-number'
import { usePortfolioHistory } from 'web/hooks/use-portfolio-history'

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

export const PortfolioValueSection = memo(
  function PortfolioValueSection(props: {
    user: User
    defaultTimePeriod: Period
    portfolio?: PortfolioSnapshot
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
            // Explicitly set to undefined or delete the key
            updatedValues[key as keyof GraphValueType] = undefined // If you want to keep the key with value undefined
            // delete updatedValues[key as keyof GraphValueType];     // If you want to remove the key entirely
          } else {
            updatedValues[key as keyof GraphValueType] = value as NonNullable<
              GraphValueType[keyof GraphValueType]
            >
          }
        })
        return updatedValues
      })
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
          portfolio={portfolio}
          user={user}
          portfolioFocus={portfolioFocus}
          setPortfolioFocus={onSetPortfolioFocus}
          graphValues={graphValues}
          setPortfolioHoveredGraph={setPortfolioHoveredGraph}
        />
      )
    }

    const { balance, investmentValue, totalDeposits, spiceBalance } =
      lastPortfolioMetrics
    const totalValue =
      balance + investmentValue + spiceBalance * SPICE_TO_MANA_CONVERSION_RATE

    const profit = totalValue - totalDeposits - firstProfit

    const portfolioValues = {
      balance,
      invested: investmentValue,
      profit,
      net: totalValue,
      spice: spiceBalance,
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
        setPortfolioHoveredGraph={setPortfolioHoveredGraph}
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
  portfolio: PortfolioSnapshot | undefined
  portfolioFocus: PortfolioMode
  setPortfolioFocus: (mode: PortfolioMode) => void
  user: User
  portfolioHoveredGraph?: PortfolioHoveredGraphType
  setPortfolioHoveredGraph: (hovered: PortfolioHoveredGraphType) => void
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
    portfolioFocus,
    setPortfolioFocus,
    portfolio,
    user,
    portfolioHoveredGraph,
    setPortfolioHoveredGraph,
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
              amount={portfolioValues?.net ?? undefined}
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
              amount={portfolioValues?.profit ?? undefined}
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
              <Row className="w-full justify-between gap-2 ">
                <Col className="grow justify-end">
                  <span
                    className={clsx(
                      'cursor-pointer select-none transition-opacity',
                      portfolioFocus == 'all'
                        ? 'opacity-100'
                        : 'opacity-50 hover:opacity-[85%]'
                    )}
                    onClick={() => togglePortfolioFocus('all')}
                  >
                    <CoinNumber
                      amount={displayAmounts(
                        graphValues.net,
                        portfolioValues?.net
                      )}
                      className={clsx(
                        'text-ink-1000 text-2xl font-bold transition-all sm:text-4xl'
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
                </Col>
                {!hideAddFundsButton && (
                  <Col className="hidden gap-1 sm:flex">
                    <AddFundsButton
                      userId={userId}
                      className="h-fit whitespace-nowrap"
                    />
                    <RedeemSpiceButton
                      userId={userId}
                      className="h-fit whitespace-nowrap"
                      spice={portfolioValues?.spice}
                    />
                  </Col>
                )}
              </Row>
              <Row className="mt-2 gap-2">
                <PortfolioGraphNumber
                  numberType={'balance'}
                  descriptor="balance"
                  portfolioFocus={portfolioFocus}
                  portfolioHoveredGraph={portfolioHoveredGraph}
                  setPortfolioHoveredGraph={setPortfolioHoveredGraph}
                  displayedAmount={displayAmounts(
                    graphValues.balance,
                    portfolioValues?.balance
                  )}
                  color={BALANCE_COLOR}
                  onClick={() => togglePortfolioFocus('balance')}
                />
                <PortfolioGraphNumber
                  numberType={'investment'}
                  descriptor="invested"
                  portfolioFocus={portfolioFocus}
                  portfolioHoveredGraph={portfolioHoveredGraph}
                  setPortfolioHoveredGraph={setPortfolioHoveredGraph}
                  displayedAmount={displayAmounts(
                    graphValues.invested,
                    portfolioValues?.invested
                  )}
                  color={INVESTMENT_COLOR}
                  onClick={() => togglePortfolioFocus('investment')}
                />

                <PortfolioGraphNumber
                  numberType={'spice'}
                  descriptor={SPICE_NAME.toLowerCase() + 's'}
                  portfolioFocus={portfolioFocus}
                  portfolioHoveredGraph={portfolioHoveredGraph}
                  setPortfolioHoveredGraph={setPortfolioHoveredGraph}
                  displayedAmount={displayAmounts(
                    graphValues.spice,
                    portfolioValues?.spice
                  )}
                  color={SPICE_COLOR}
                  onClick={() => togglePortfolioFocus('spice')}
                  isSpice
                />
              </Row>
            </Col>
          )}
          {graphMode == 'profit' && (
            <>
              <div>
                <span>
                  <CoinNumber
                    amount={displayAmounts(
                      graphValues.profit,
                      portfolioValues?.profit
                    )}
                    className={clsx(
                      'text-ink-1000 text-2xl font-bold transition-all sm:text-4xl',
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
              </div>

              <ProfitWidget user={user} portfolio={portfolio} />
            </>
          )}
        </div>
        <SizedContainer
          className={clsx(
            className,
            'mt-2',
            size == 'sm' ? 'h-[80px] sm:h-[100px]' : 'h-[125px] sm:h-[200px]'
          )}
          style={{
            paddingRight: Y_AXIS_MARGIN,
          }}
        >
          {graphElement}
        </SizedContainer>
        {!hideSwitcher && (
          <TimeRangePicker
            currentTimePeriod={currentTimePeriod}
            setCurrentTimePeriod={setCurrentTimePeriod}
            color={switcherColor}
            disabled={disabled}
            className="bg-canvas-50 mt-8 border-0"
            toggleClassName="grow justify-center"
          />
        )}
        {!hideAddFundsButton && graphMode === 'portfolio' && (
          <Row className="mt-4 w-full gap-1 sm:hidden">
            <AddFundsButton
              userId={userId}
              className="w-1/2 whitespace-nowrap"
            />
            <RedeemSpiceButton
              userId={userId}
              className="w-1/2 whitespace-nowrap"
              spice={portfolioValues?.spice}
            />
          </Row>
        )}
      </Col>
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
