import { HistoryPoint } from 'common/chart'
import { PortfolioMetrics } from 'common/portfolio-metrics'
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

export type GraphMode = 'portfolio' | 'profit'
export type PortfolioMode = 'balance' | 'investment' | 'all'

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
  // points: HistoryPoint<Partial<PortfolioMetrics>>[]
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
}) => {
  const {
    mode,
    duration,
    // points,
    firstProfit,
    portfolioHistory,
    onMouseOver,
    width,
    height,
    zoomParams,
    negativeThreshold,
    hideXAxis,
    setGraphBalance,
    setGraphInvested,
    setGraphProfit,
  } = props

  const { profitPoints, investmentPoints, balancePoints, networthPoints } =
    useMemo(() => {
      if (!portfolioHistory?.length) {
        return {
          profitPoints: [],
          investmentPoints: [],
          balancePoints: [],
          networthPoints: [],
        }
      }

      const profitPoints: HistoryPoint<Partial<PortfolioMetrics>>[] = []
      const investmentPoints: HistoryPoint<Partial<PortfolioMetrics>>[] = []
      const balancePoints: HistoryPoint<Partial<PortfolioMetrics>>[] = []
      const networthPoints: HistoryPoint<Partial<PortfolioMetrics>>[] = []

      portfolioHistory.forEach((p) => {
        profitPoints.push({
          x: p.timestamp,
          y: p.balance + p.investmentValue - p.totalDeposits - firstProfit,
          obj: p,
        })
        investmentPoints.push({
          x: p.timestamp,
          y: p.investmentValue,
          obj: p,
        })
        balancePoints.push({
          x: p.timestamp,
          y: p.balance,
          obj: p,
        })
        networthPoints.push({
          x: p.timestamp,
          y: p.balance + p.investmentValue,
          obj: p,
        })
      })

      return { profitPoints, investmentPoints, balancePoints, networthPoints }
    }, [portfolioHistory])

  const { minDate, maxDate, minValue, maxValue } = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const minDate =
      mode == 'portfolio'
        ? min([
            min(balancePoints.map((d) => d.x)!),
            min(investmentPoints.map((d) => d.x)!),
          ])!
        : min(profitPoints.map((d) => d.x))!
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const maxDate =
      mode == 'portfolio'
        ? max([
            max(balancePoints.map((d) => d.x)!),
            max(investmentPoints.map((d) => d.x)!),
          ])!
        : max(profitPoints.map((d) => d.x))!

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const minValue =
      mode == 'portfolio'
        ? min(balancePoints.map((d) => d.y))!
        : min(profitPoints.map((d) => d.y))!
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const maxValue =
      mode == 'portfolio'
        ? max(networthPoints.map((d) => d.y))!
        : max(profitPoints.map((d) => d.y))!
    return { minDate, maxDate, minValue, maxValue }
  }, [mode])

  const tinyDiff = Math.abs(maxValue - minValue) < 20
  const xScale = scaleTime([minDate, maxDate], [0, width])
  const yScale = scaleLinear(
    [tinyDiff ? minValue - 50 : minValue, tinyDiff ? maxValue + 50 : maxValue],
    [height, 0]
  )

  // reset axis scale if mode or duration change (since points change)
  useEffect(() => {
    zoomParams?.setXScale(xScale)
  }, [mode, duration])

  if (mode == 'portfolio') {
    return (
      <PortfolioChart
        data={{
          balance: { points: balancePoints, color: '#4f46e5' },
          investment: { points: investmentPoints, color: '#818cf8' },
        }}
        w={width > 768 ? 768 : width}
        h={height}
        xScale={xScale}
        yScale={yScale}
        yKind="Ṁ"
      />
    )
  }
  return (
    <SingleValueHistoryChart
      w={width > 768 ? 768 : width}
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
