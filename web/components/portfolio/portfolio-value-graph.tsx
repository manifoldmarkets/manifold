import { scaleLinear, scaleTime } from 'd3-scale'
import { curveLinear } from 'd3-shape'
import dayjs from 'dayjs'
import { max, min } from 'lodash'
import { useEffect, useMemo } from 'react'
import { SingleValueHistoryChart } from 'web/components/charts/generic-charts'
import { Period } from 'web/lib/firebase/users'
import { PortfolioSnapshot } from 'web/lib/supabase/portfolio-history'
import { ZoomParams } from '../charts/helpers'
import { Col } from '../layout/col'
import { PortfolioChart } from './portfolio-chart'
import { PortfolioHoveredGraphType } from './portfolio-value-section'
import { getPortfolioPointsFromHistory } from 'common/supabase/portfolio-metrics'
import { findMinMax } from 'web/lib/util/minMax'

export type GraphMode = 'portfolio' | 'profit'
export type PortfolioMode = 'balance' | 'investment' | 'all'
export const BALANCE_COLOR = '#4f46e5'
export const INVESTMENT_COLOR = '#818cf8'

export const PortfolioTooltip = (props: { date: Date }) => {
  const d = dayjs(props.date)
  return (
    <Col className="text-xs font-semibold sm:text-sm">
      <div>{d.format('MMM/D/YY')}</div>
      <div className="text-2xs text-ink-600 font-normal sm:text-xs">
        {d.format('h:mm A')}
      </div>
    </Col>
  )
}

export const PortfolioGraph = (props: {
  mode: GraphMode
  duration?: Period
  portfolioHistory: PortfolioSnapshot[]
  width: number
  height: number
  zoomParams?: ZoomParams
  negativeThreshold?: number
  hideXAxis?: boolean
  firstProfit: number
  setGraphBalance: (balance: number | undefined) => void
  setGraphInvested: (invested: number | undefined) => void
  setGraphProfit: (profit: number | undefined) => void
  portfolioFocus: PortfolioMode
  setPortfolioFocus: (mode: PortfolioMode) => void
  portfolioHoveredGraph: PortfolioHoveredGraphType
  setPortfolioHoveredGraph: (hovered: PortfolioHoveredGraphType) => void
}) => {
  const {
    mode,
    duration,
    firstProfit,
    portfolioHistory,
    width,
    height,
    zoomParams,
    negativeThreshold = 0,
    hideXAxis,
    setGraphBalance,
    setGraphInvested,
    setGraphProfit,
    portfolioFocus,
    setPortfolioFocus,
    portfolioHoveredGraph,
    setPortfolioHoveredGraph,
  } = props

  const { profitPoints, investmentPoints, balancePoints, networthPoints } =
    getPortfolioPointsFromHistory(portfolioHistory, firstProfit)

  const { minDate, maxDate, minValue, maxValue } = useMemo(() => {
    if (mode == 'portfolio') {
      const balanceXPoints = balancePoints.map((d) => d.x)!
      const { min: balanceXMin, max: balanceXMax } = findMinMax(balanceXPoints)
      const balanceYPoints = balancePoints.map((d) => d.y)!
      const { min: balanceYMin, max: balanceYMax } = findMinMax(balanceYPoints)

      const investmentXPoints = investmentPoints.map((d) => d.x)!
      const { min: investmentXMin, max: investmentXMax } =
        findMinMax(investmentXPoints)
      const investmentYPoints = investmentPoints.map((d) => d.y)!
      const { min: investmentYMin, max: investmentYMax } =
        findMinMax(investmentYPoints)

      const networthYPoints = networthPoints.map((d) => d.y)!
      const { min: networthYMin, max: networthYMax } =
        findMinMax(networthYPoints)

      const minDate =
        portfolioFocus == 'all'
          ? min([balanceXMin, investmentXMin])!
          : portfolioFocus == 'balance'
          ? balanceXMin
          : investmentXMin
      const maxDate =
        portfolioFocus == 'all'
          ? max([balanceXMax, investmentXMax])!
          : portfolioFocus == 'balance'
          ? balanceXMax
          : investmentXMax
      const minValue =
        portfolioFocus == 'all'
          ? min([balanceYMin, networthYMin])!
          : portfolioFocus == 'balance'
          ? balanceYMin
          : investmentYMin
      const maxValue =
        portfolioFocus == 'all'
          ? max([networthYMax, balanceYMax])!
          : portfolioFocus == 'balance'
          ? balanceYMax
          : investmentYMax
      return { minDate, maxDate, minValue, maxValue }
    } else {
      const profitXPoints = profitPoints.map((d) => d.x)!
      const { min: profitXMin, max: profitXMax } = findMinMax(profitXPoints)
      const profitYPoints = profitPoints.map((d) => d.y)!
      const { min: profitYMin, max: profitYMax } = findMinMax(profitYPoints)
      return {
        minDate: profitXMin,
        maxDate: profitXMax,
        minValue: profitYMin,
        maxValue: profitYMax,
      }
    }
  }, [duration, portfolioFocus, mode])

  const tinyDiff = Math.abs(maxValue - minValue) < 20
  const xScale = scaleTime([minDate, maxDate], [0, width])
  const yScale = scaleLinear(
    [tinyDiff ? minValue - 50 : minValue, tinyDiff ? maxValue + 50 : maxValue],
    [height, 0]
  )

  // reset axis scale if mode or duration change (since points change)
  useEffect(() => {
    zoomParams?.setXScale(xScale)
  }, [mode, duration, portfolioFocus])

  if (mode == 'portfolio') {
    if (portfolioFocus == 'all') {
      return (
        <PortfolioChart
          data={{
            balance: { points: balancePoints, color: BALANCE_COLOR },
            investment: { points: investmentPoints, color: INVESTMENT_COLOR },
          }}
          w={width}
          h={height}
          xScale={xScale}
          yScale={yScale}
          yKind="Ṁ"
          setGraphBalance={setGraphBalance}
          setGraphInvested={setGraphInvested}
          setPortfolioFocus={setPortfolioFocus}
          portfolioHoveredGraph={portfolioHoveredGraph}
          setPortfolioHoveredGraph={setPortfolioHoveredGraph}
        />
      )
    } else {
      return (
        <SingleValueHistoryChart
          w={width}
          h={height}
          xScale={xScale}
          yScale={yScale}
          zoomParams={zoomParams}
          yKind="Ṁ"
          data={portfolioFocus == 'balance' ? balancePoints : investmentPoints}
          Tooltip={(props) => (
            // eslint-disable-next-line react/prop-types
            <PortfolioTooltip date={xScale.invert(props.x)} />
          )}
          onMouseOver={(p) => {
            portfolioFocus == 'balance'
              ? setGraphBalance(p ? p.y : undefined)
              : setGraphInvested(p ? p.y : undefined)
          }}
          curve={curveLinear}
          negativeThreshold={negativeThreshold}
          hideXAxis={hideXAxis}
          color={portfolioFocus == 'balance' ? BALANCE_COLOR : INVESTMENT_COLOR}
          onGraphClick={() => {
            setPortfolioFocus('all')
          }}
          areaClassName="hover:opacity-100 opacity-[0.85] transition-opacity"
        />
      )
    }
  }
  return (
    <SingleValueHistoryChart
      w={width}
      h={height}
      xScale={xScale}
      yScale={yScale}
      zoomParams={zoomParams}
      yKind="Ṁ"
      data={profitPoints}
      // eslint-disable-next-line react/prop-types
      Tooltip={(props) => <PortfolioTooltip date={xScale.invert(props.x)} />}
      onMouseOver={(p) => {
        setGraphProfit(p ? p.y : undefined)
      }}
      curve={curveLinear}
      color={mode === 'profit' ? ['#14b8a6', '#F75836'] : '#4f46e5'}
      negativeThreshold={negativeThreshold}
      hideXAxis={hideXAxis}
    />
  )
}
