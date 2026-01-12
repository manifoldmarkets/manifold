'use client'
import clsx from 'clsx'
import { Period, periodDurations } from 'common/period'
import { LivePortfolioMetrics } from 'common/portfolio-metrics'
import { last, sortBy } from 'lodash'
import { ReactNode, memo, useMemo, useState } from 'react'
import { SizedContainer } from 'web/components/sized-container'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { usePortfolioHistory } from 'web/hooks/use-portfolio-history'
import { User } from 'web/lib/firebase/users'
import PlaceholderGraph from 'web/lib/icons/placeholder-graph.svg'
import { Y_AXIS_MARGIN, useZoom } from '../charts/helpers'
import { TimeRangePicker } from '../charts/time-range-picker'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { SweepsToggle } from '../sweeps/sweeps-toggle'
import { ColorType } from '../widgets/choices-toggle-group'
import { TokenNumber } from '../widgets/token-number'
import { PortfolioGraphNumber } from './portfolio-graph-number'
import { PortfolioGraph, PortfolioMode } from './portfolio-graph'
import { getPortfolioValues } from '../portfolio-helpers'
import { useSweepstakes } from '../sweepstakes-provider'
import { SPICE_TO_MANA_CONVERSION_RATE } from 'common/envs/constants'
import { filterDefined } from 'common/util/array'
import { DailyLeagueStat } from '../home/daily-league-stat'
import { AddFundsButton } from '../profile/add-funds-button'

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
  cashBalance?: number | null
  cashInvested?: number | null
  cashProfit?: number | null
  netCash?: number | null
}

export type PortfolioValueType = Required<GraphValueType>

export const emptyGraphValues = {
  net: undefined,
  balance: undefined,
  invested: undefined,
  profit: undefined,
  spice: undefined,
  cashBalance: undefined,
  cashInvested: undefined,
  cashProfit: undefined,
  netCash: undefined,
}

export const PortfolioValueSection = memo(
  function PortfolioValueSection(props: {
    user: User
    defaultTimePeriod: Period
    portfolio?: LivePortfolioMetrics
    graphContainerClassName?: string
    size?: 'sm' | 'md'
  }) {
    const {
      user,
      defaultTimePeriod,
      portfolio,
      graphContainerClassName,
      size = 'md',
    } = props
    const [currentTimePeriod, setCurrentTimePeriod] =
      useState<Period>(defaultTimePeriod)

    const portfolioHistory = usePortfolioHistory(user.id, currentTimePeriod)

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

    const updatedPortfolioHistory = useMemo(
      () =>
        sortBy(
          filterDefined([...(portfolioHistory ?? []), portfolio]),
          (p) => p.timestamp
        ),
      [portfolioHistory, portfolio]
    )
    const lastPortfolioMetrics = last(updatedPortfolioHistory)

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
    const sweepsState = useSweepstakes()

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
          userId={user.id}
          hideSwitcher={true}
          hideSweepsToggle={true}
          currentTimePeriod={currentTimePeriod}
          setCurrentTimePeriod={setCurrentTimePeriod}
          className={clsx(
            portfolioHistory ? 'h-8' : '',
            graphContainerClassName
          )}
          portfolioGraphElement={noHistoryGraphElement}
          disabled={true}
          size={size}
          portfolioFocus={portfolioFocus}
          setPortfolioFocus={onSetPortfolioFocus}
          graphValues={graphValues}
        />
      )
    }

    const { balance, investmentValue, cashBalance, cashInvestmentValue } =
      lastPortfolioMetrics

    const first = portfolioHistory?.[0]

    const { firstProfit, totalValue, calculatedProfit } = getPortfolioValues({
      first: first
        ? {
            balance:
              first.balance +
              (first.spiceBalance ?? 0) * SPICE_TO_MANA_CONVERSION_RATE,
            investmentValue: first.investmentValue,
            totalDeposits: first.totalDeposits,
          }
        : undefined,
      last: {
        balance:
          lastPortfolioMetrics.balance +
          (lastPortfolioMetrics.spiceBalance ?? 0) *
            SPICE_TO_MANA_CONVERSION_RATE,
        investmentValue: lastPortfolioMetrics.investmentValue,
        totalDeposits: lastPortfolioMetrics.totalDeposits,
      },
    })

    const {
      firstProfit: firstCashProfit,
      totalValue: totalCashValue,
      calculatedProfit: calculatedCashProfit,
    } = getPortfolioValues({
      first: first
        ? {
            balance: first.cashBalance,
            investmentValue: first.cashInvestmentValue,
            totalDeposits: first.totalCashDeposits,
          }
        : undefined,
      last: {
        balance: lastPortfolioMetrics.cashBalance,
        investmentValue: lastPortfolioMetrics.cashInvestmentValue,
        totalDeposits: lastPortfolioMetrics.totalCashDeposits,
      },
    })

    const profit =
      currentTimePeriod === 'daily' && portfolio
        ? portfolio.dailyProfit
        : calculatedProfit

    const portfolioValues = {
      balance,
      invested: investmentValue,
      profit,
      net: totalValue,
      cashBalance: cashBalance ?? 0,
      cashInvested: cashInvestmentValue ?? 0,
      cashProfit: calculatedCashProfit ?? 0,
      netCash: totalCashValue,
    }

    const hideSweepsToggle =
      user.createdTime > new Date('2025-02-12').getTime() ||
      portfolioValues.netCash <= 0
    const prefersPlay = hideSweepsToggle ? true : sweepsState.prefersPlay
    return (
      <TwombaPortfolioValueSkeleton
        userId={user.id}
        hideSweepsToggle={hideSweepsToggle}
        currentTimePeriod={currentTimePeriod}
        setCurrentTimePeriod={setTimePeriod}
        portfolioFocus={portfolioFocus}
        setPortfolioFocus={onSetPortfolioFocus}
        portfolioGraphElement={(width, height) => (
          <PortfolioGraph
            prefersPlay={!!prefersPlay}
            duration={currentTimePeriod}
            portfolioHistory={updatedPortfolioHistory}
            width={width}
            height={height}
            zoomParams={zoomParams}
            hideXAxis={currentTimePeriod !== 'allTime' && isMobile}
            firstProfit={firstProfit}
            firstCashProfit={firstCashProfit}
            updateGraphValues={updateGraphValues}
            portfolioFocus={portfolioFocus}
            setPortfolioFocus={onSetPortfolioFocus}
          />
        )}
        className={clsx(graphContainerClassName, !isMobile && 'mb-4')}
        size={size}
        portfolioValues={portfolioValues}
        graphValues={graphValues}
      />
    )
  }
)

function TwombaPortfolioValueSkeleton(props: {
  currentTimePeriod: Period
  setCurrentTimePeriod: (timePeriod: Period) => void
  portfolioGraphElement:
    | ((width: number, height: number) => ReactNode)
    | undefined
  hideSwitcher?: boolean
  className?: string
  switcherColor?: ColorType
  userId?: string
  disabled?: boolean
  size?: 'sm' | 'md'
  portfolioValues?: PortfolioValueType
  graphValues: GraphValueType
  portfolioFocus: PortfolioMode
  setPortfolioFocus: (mode: PortfolioMode) => void
  hideSweepsToggle?: boolean
}) {
  const {
    currentTimePeriod,
    setCurrentTimePeriod,
    portfolioGraphElement,
    hideSwitcher,
    switcherColor,
    disabled,
    className,
    portfolioValues,
    graphValues,
    portfolioFocus,
    setPortfolioFocus,
    hideSweepsToggle,
    userId,
  } = props

  function togglePortfolioFocus(toggleTo: PortfolioMode) {
    setPortfolioFocus(portfolioFocus === toggleTo ? 'all' : toggleTo)
    setPortfolioFocus(portfolioFocus === toggleTo ? 'all' : toggleTo)
  }

  const sweepsState = useSweepstakes()
  const prefersPlay = hideSweepsToggle ? true : sweepsState.prefersPlay

  return (
    <Col>
      <Col className={clsx('gap-2')}>
        <Row className="text-ink-800 w-full items-center justify-between text-xl font-semibold">
          Portfolio
          <Row className="items-center gap-2">
            {!hideSweepsToggle && (
              <SweepsToggle sweepsEnabled={true} isPlay={prefersPlay} />
            )}
            <AddFundsButton
              userId={userId}
              size="xs"
              className="hidden sm:flex"
            />
          </Row>
        </Row>
        <Col className="bg-canvas-0 w-full rounded-lg p-4">
          <Col>
            <span
              className={clsx(
                'cursor-pointer select-none transition-opacity',
                portfolioFocus == 'all'
                  ? prefersPlay
                    ? 'text-violet-600 opacity-100 dark:text-violet-400'
                    : 'text-amber-700 opacity-100 dark:text-amber-600'
                  : 'text-ink-1000 opacity-50 hover:opacity-[85%]'
              )}
              onClick={() => togglePortfolioFocus('all')}
            >
              <TokenNumber
                amount={displayAmounts(
                  graphValues.net,
                  prefersPlay ? portfolioValues?.net : portfolioValues?.netCash
                )}
                className={clsx(
                  'text-3xl font-bold transition-all sm:text-4xl'
                )}
                isInline
                coinClassName="top-[0.25rem] sm:top-[0.1rem]"
                coinType={prefersPlay ? 'mana' : 'sweepies'}
              />
              <span
                className={clsx(
                  'text-ink-600 ml-1 whitespace-nowrap text-sm transition-all sm:ml-1.5 sm:text-base'
                )}
              >
                net worth
              </span>
            </span>
            <Row className="-mr-4 mt-2 gap-2">
              <PortfolioGraphNumber
                prefersPlay={prefersPlay}
                numberType={'balance'}
                descriptor="balance"
                portfolioFocus={portfolioFocus}
                displayedAmount={displayAmounts(
                  graphValues.balance,
                  prefersPlay
                    ? portfolioValues?.balance
                    : portfolioValues?.cashBalance
                )}
                className={clsx(
                  portfolioFocus == 'balance'
                    ? prefersPlay
                      ? 'bg-violet-700 text-white'
                      : 'bg-amber-700 text-white'
                    : 'bg-canvas-50 text-ink-1000'
                )}
                onClick={() => togglePortfolioFocus('balance')}
              />
              <PortfolioGraphNumber
                prefersPlay={prefersPlay}
                numberType={'investment'}
                descriptor="invested"
                portfolioFocus={portfolioFocus}
                displayedAmount={displayAmounts(
                  graphValues.invested,
                  prefersPlay
                    ? portfolioValues?.invested
                    : portfolioValues?.cashInvested
                )}
                className={clsx(
                  portfolioFocus == 'investment'
                    ? prefersPlay
                      ? 'bg-violet-700 text-white'
                      : 'bg-amber-700 text-white'
                    : 'bg-canvas-50 text-ink-1000'
                )}
                onClick={() => togglePortfolioFocus('investment')}
              />
              <PortfolioGraphNumber
                prefersPlay={prefersPlay}
                numberType={'profit'}
                descriptor="profit"
                portfolioFocus={portfolioFocus}
                displayedAmount={displayAmounts(
                  graphValues.profit,
                  prefersPlay
                    ? portfolioValues?.profit
                    : portfolioValues?.cashProfit
                )}
                className={clsx(
                  portfolioFocus == 'profit'
                    ? prefersPlay
                      ? 'bg-violet-700 text-white'
                      : 'bg-amber-700 text-white'
                    : 'bg-canvas-50 text-ink-1000'
                )}
                onClick={() => togglePortfolioFocus('profit')}
              />
              <DailyLeagueStat
                userId={userId}
                className={clsx(
                  'group cursor-pointer select-none rounded px-2 py-1 transition-colors',
                  'bg-canvas-50 text-ink-1000 opacity-[0.75] hover:opacity-100'
                )}
              />
            </Row>
          </Col>
          {portfolioGraphElement && (
            <SizedContainer
              className={clsx(className, 'mt-2 h-[70px] sm:h-[80px]')}
              style={{
                paddingRight: Y_AXIS_MARGIN,
              }}
            >
              {portfolioGraphElement}
            </SizedContainer>
          )}
        </Col>
        {!hideSwitcher && (
          <TimeRangePicker
            currentTimePeriod={currentTimePeriod}
            setCurrentTimePeriod={setCurrentTimePeriod}
            color={switcherColor}
            disabled={disabled}
            className="bg-canvas-0 border-0"
            toggleClassName="grow justify-center"
            ignoreLabels={['1H', '6H']}
          />
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
