import dayjs from 'dayjs'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Bet } from 'common/bet'
import {
  getInitialProbability,
  getOutcomeProbability,
  getProbability,
} from 'common/calculate'
import {
  Contract,
  BinaryContract,
  PseudoNumericContract,
  FreeResponseContract,
  MultipleChoiceContract,
} from 'common/contract'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { formatLargeNumber } from 'common/util/format'
import { range, sortBy, groupBy, sumBy } from 'lodash'
import { useEvent } from 'web/hooks/use-event'

import * as d3 from 'd3'

const MARGIN = { top: 20, right: 10, bottom: 20, left: 40 }
const MARGIN_X = MARGIN.right + MARGIN.left
const MARGIN_Y = MARGIN.top + MARGIN.bottom

type MultiPoint = readonly [Date, number[]]
type Point = readonly [Date, number]

const useElementWidth = <T extends Element>(ref: React.RefObject<T>) => {
  const [width, setWidth] = useState<number>()
  useEffect(() => {
    const handleResize = () => {
      setWidth(ref.current?.clientWidth)
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [ref])
  return width
}

const formatDate = (
  date: Date,
  opts: { includeYear: boolean; includeHour: boolean; includeMinute: boolean }
) => {
  const { includeYear, includeHour, includeMinute } = opts
  const d = dayjs(date)
  const now = Date.now()
  if (d.add(1, 'minute').isAfter(now) && d.subtract(1, 'minute').isBefore(now))
    return 'Now'
  if (d.isSame(now, 'day')) {
    return '[Today]'
  } else if (d.add(1, 'day').isSame(now, 'day')) {
    return '[Yesterday]'
  } else {
    let format = 'MMM D'
    if (includeMinute) {
      format += ', h:mma'
    } else if (includeHour) {
      format += ', ha'
    } else if (includeYear) {
      format += ', YYYY'
    }
    return d.format(format)
  }
}

const getDateRange = (contract: Contract) => {
  const { createdTime, closeTime, resolutionTime } = contract
  const now = Date.now()
  const isClosed = !!closeTime && now > closeTime
  const endDate = resolutionTime ?? (isClosed ? closeTime : now)
  // the graph should be minimum an hour wide
  const adjustedEndDate = dayjs(createdTime).add(1, 'hour').isAfter(endDate)
    ? dayjs(endDate).add(1, 'hours')
    : dayjs(endDate)
  return [new Date(createdTime), adjustedEndDate.toDate()] as const
}

const getTickValues = (min: number, max: number, n: number) => {
  const step = (max - min) / (n - 1)
  return [min, ...range(1, n - 1).map((i) => min + step * i), max]
}

const getMultiChartData = (
  contract: FreeResponseContract | MultipleChoiceContract,
  bets: Bet[]
) => {
  const { totalBets, outcomeType } = contract

  const sortedBets = sortBy(bets, (b) => b.createdTime)
  const betsByOutcome = groupBy(sortedBets, (bet) => bet.outcome)
  const outcomes = Object.keys(betsByOutcome).filter((outcome) => {
    const maxProb = Math.max(
      ...betsByOutcome[outcome].map((bet) => bet.probAfter)
    )
    return (
      (outcome !== '0' || outcomeType === 'MULTIPLE_CHOICE') &&
      maxProb > 0.02 &&
      totalBets[outcome] > 0.000000001
    )
  })

  const trackedOutcomes = sortBy(
    outcomes,
    (outcome) => -1 * getOutcomeProbability(contract, outcome)
  )
    .slice(0, 10)
    .reverse()

  const points: MultiPoint[] = []

  const sharesByOutcome = Object.fromEntries(
    Object.keys(betsByOutcome).map((outcome) => [outcome, 0])
  )

  for (const bet of sortedBets) {
    const { outcome, shares } = bet
    sharesByOutcome[outcome] += shares

    const sharesSquared = sumBy(
      Object.values(sharesByOutcome).map((shares) => shares ** 2)
    )
    points.push([
      new Date(bet.createdTime),
      trackedOutcomes.map(
        (outcome) => sharesByOutcome[outcome] ** 2 / sharesSquared
      ),
    ])
  }

  const allPoints: MultiPoint[] = [
    [new Date(contract.createdTime), trackedOutcomes.map((_) => 0)],
    ...points,
    [
      new Date(Date.now()),
      trackedOutcomes.map((outcome) =>
        getOutcomeProbability(contract, outcome)
      ),
    ],
  ]
  return { points: allPoints, labels: trackedOutcomes }
}

const getChartData = (
  contract: BinaryContract | PseudoNumericContract,
  bets: Bet[]
): Point[] => {
  const getY = (p: number) => {
    if (contract.outcomeType === 'PSEUDO_NUMERIC') {
      const { min, max } = contract
      return p * (max - min) + min
    } else {
      return p
    }
  }
  const sortedBets = sortBy(bets, (b) => b.createdTime)
  const startProb = getInitialProbability(contract)
  const endProb = getProbability(contract)
  return [
    [new Date(contract.createdTime), getY(startProb)] as const,
    ...sortedBets.map(
      (b) => [new Date(b.createdTime), getY(b.probAfter)] as const
    ),
    [new Date(Date.now()), getY(endProb)] as const,
  ]
}

const XAxis = (props: { w: number; h: number; scale: d3.AxisScale<Date> }) => {
  const { h, scale } = props
  const axisRef = useRef<SVGGElement>(null)
  const [start, end] = scale.domain()
  const fmt = getFormatterForDateRange(start, end)
  useEffect(() => {
    if (axisRef.current != null) {
      const axis = d3.axisBottom(scale).tickFormat(fmt)
      d3.select(axisRef.current)
        .call(axis)
        .call((g) => g.select('.domain').remove())
    }
  })
  return <g ref={axisRef} transform={`translate(0, ${h})`} />
}

const YAxis = (props: {
  w: number
  h: number
  scale: d3.AxisScale<number>
  pct?: boolean
}) => {
  const { w, h, scale, pct } = props
  const axisRef = useRef<SVGGElement>(null)
  const [min, max] = scale.domain()
  const tickValues = getTickValues(min, max, h < 200 ? 3 : 5)
  const fmt = (n: number) => (pct ? d3.format('.0%')(n) : formatLargeNumber(n))
  useEffect(() => {
    if (axisRef.current != null) {
      const axis = d3.axisLeft(scale).tickValues(tickValues).tickFormat(fmt)
      d3.select(axisRef.current)
        .call(axis)
        .call((g) => g.select('.domain').remove())
        .call((g) =>
          g.selectAll('.tick line').attr('x2', w).attr('stroke-opacity', 0.1)
        )
    }
  })
  return <g ref={axisRef} />
}

const LinePathInternal = <P,>(
  props: {
    data: P[]
    px: number | ((p: P) => number)
    py: number | ((p: P) => number)
  } & React.SVGProps<SVGPathElement>
) => {
  const { data, px, py, ...rest } = props
  const line = d3.line<P>(px, py).curve(d3.curveStepAfter)
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return <path {...rest} fill="none" d={line(data)!} />
}
const LinePath = memo(LinePathInternal) as typeof LinePathInternal

const AreaPathInternal = <P,>(
  props: {
    data: P[]
    px: number | ((p: P) => number)
    py0: number | ((p: P) => number)
    py1: number | ((p: P) => number)
  } & React.SVGProps<SVGPathElement>
) => {
  const { data, px, py0, py1, ...rest } = props
  const area = d3.area<P>(px, py0, py1).curve(d3.curveStepAfter)
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return <path {...rest} d={area(data)!} />
}
const AreaPath = memo(AreaPathInternal) as typeof AreaPathInternal

const TwoAxisChart = (props: {
  children: React.ReactNode
  w: number
  h: number
  xScale: d3.ScaleTime<number, number>
  yScale: d3.ScaleContinuousNumeric<number, number>
  onMouseOver?: (ev: React.PointerEvent) => void
  onMouseLeave?: (ev: React.PointerEvent) => void
  pct?: boolean
}) => {
  const { children, w, h, xScale, yScale, onMouseOver, onMouseLeave, pct } =
    props
  const innerW = w - MARGIN_X
  const innerH = h - MARGIN_Y
  return (
    <svg className="w-full" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <g transform={`translate(${MARGIN.left}, ${MARGIN.top})`}>
        <XAxis scale={xScale} w={innerW} h={innerH} />
        <YAxis scale={yScale} w={innerW} h={innerH} pct={pct} />
        {children}
        <rect
          x="0"
          y="0"
          width={innerW}
          height={innerH}
          fill="none"
          pointerEvents="all"
          onPointerEnter={onMouseOver}
          onPointerMove={onMouseOver}
          onPointerLeave={onMouseLeave}
        />
      </g>
    </svg>
  )
}

export const MultiValueHistoryChart = (props: {
  data: MultiPoint[]
  w: number
  h: number
  labels: readonly string[]
  colors: readonly string[]
  xScale: d3.ScaleTime<number, number>
  yScale: d3.ScaleContinuousNumeric<number, number>
  pct?: boolean
}) => {
  const { colors, data, xScale, yScale, labels, w, h, pct } = props
  const tooltipRef = useRef<HTMLDivElement>(null)
  const stack = d3
    .stack<MultiPoint, number>()
    .keys(range(0, labels.length))
    .value((p, o) => p[1][o])

  return (
    <div className="relative">
      <div
        ref={tooltipRef}
        style={{ display: 'none' }}
        className="pointer-events-none absolute z-10 whitespace-pre rounded border-2 border-black bg-slate-600/75 p-2 text-white"
      />
      <TwoAxisChart w={w} h={h} xScale={xScale} yScale={yScale} pct={pct}>
        {stack(data).map((s, i) => (
          <g key={s.key}>
            <LinePath
              data={s}
              px={(p) => xScale(p.data[0])}
              py={(p) => yScale(p[1])}
              stroke={colors[i]}
            />
            <AreaPath
              data={s}
              px={(p) => xScale(p.data[0])}
              py0={(p) => yScale(p[0])}
              py1={(p) => yScale(p[1])}
              fill={colors[i]}
            />
          </g>
        ))}
      </TwoAxisChart>
    </div>
  )
}

export const SingleValueHistoryChart = (props: {
  data: Point[]
  w: number
  h: number
  color: string
  xScale: d3.ScaleTime<number, number>
  yScale: d3.ScaleContinuousNumeric<number, number>
  pct?: boolean
}) => {
  const { color, data, xScale, yScale, pct, w, h } = props
  const tooltipRef = useRef<HTMLDivElement>(null)
  const dates = useMemo(() => data.map(([d]) => d), [data])
  const [startDate, endDate] = xScale.domain().map(dayjs)
  const includeYear = !startDate.isSame(endDate, 'year')
  const includeHour = startDate.add(8, 'day').isAfter(endDate)
  const includeMinute = endDate.diff(startDate, 'hours') < 2
  const formatX = (d: Date) =>
    formatDate(d, { includeYear, includeHour, includeMinute })
  const formatY = (n: number) =>
    pct ? d3.format('.0%')(n) : formatLargeNumber(n)

  const onMouseOver = useEvent((event: React.PointerEvent) => {
    const tt = tooltipRef.current
    if (tt != null) {
      const [mouseX, mouseY] = d3.pointer(event)
      const date = xScale.invert(mouseX)
      const [_, prob] = data[d3.bisectCenter(dates, date)]
      tt.innerHTML = `<strong>${formatY(prob)}</strong> ${formatX(date)}`
      tt.style.display = 'block'
      tt.style.top = mouseY - 10 + 'px'
      tt.style.left = mouseX + 20 + 'px'
    }
  })

  const onMouseLeave = useEvent(() => {
    const tt = tooltipRef.current
    if (tt != null) {
      tt.style.display = 'none'
    }
  })

  return (
    <div className="relative">
      <div
        ref={tooltipRef}
        style={{ display: 'none' }}
        className="pointer-events-none absolute z-10 whitespace-pre rounded border-2 border-black bg-slate-600/75 p-2 text-white"
      />
      <TwoAxisChart
        w={w}
        h={h}
        xScale={xScale}
        yScale={yScale}
        pct={pct}
        onMouseOver={onMouseOver}
        onMouseLeave={onMouseLeave}
      >
        <LinePath
          data={data}
          px={(p) => xScale(p[0])}
          py={(p) => yScale(p[1])}
          stroke={color}
        />
        <AreaPath
          data={data}
          px={(p) => xScale(p[0])}
          py0={yScale(0)}
          py1={(p) => yScale(p[1])}
          fill={color}
          fillOpacity={0.3}
        />
      </TwoAxisChart>
    </div>
  )
}

export const ContractChart = (props: {
  contract: Contract
  bets: Bet[]
  height?: number
}) => {
  const { contract } = props
  switch (contract.outcomeType) {
    case 'BINARY':
      return <BinaryContractChart {...{ ...props, contract }} />
    case 'PSEUDO_NUMERIC':
      return <PseudoNumericContractChart {...{ ...props, contract }} />
    case 'FREE_RESPONSE':
    case 'MULTIPLE_CHOICE':
      return <ChoiceContractChart {...{ ...props, contract }} />
    default:
      return null
  }
}

const getFormatterForDateRange = (start: Date, end: Date) => {
  const opts = {
    includeYear: !dayjs(start).isSame(end, 'year'),
    includeHour: dayjs(start).add(8, 'day').isAfter(end),
    includeMinute: dayjs(end).diff(start, 'hours') < 2,
  }
  return (d: Date) => formatDate(d, opts)
}

export const PseudoNumericContractChart = (props: {
  contract: PseudoNumericContract
  bets: Bet[]
  height?: number
}) => {
  const { contract, bets } = props
  const data = useMemo(() => getChartData(contract, bets), [contract, bets])
  const isMobile = useIsMobile(800)
  const containerRef = useRef<HTMLDivElement>(null)
  const width = useElementWidth(containerRef) ?? 0
  const height = props.height ?? isMobile ? 150 : 250
  const scaleType = contract.isLogScale ? d3.scaleLog : d3.scaleLinear
  const xScale = d3.scaleTime(getDateRange(contract), [0, width - MARGIN_X])
  const yScale = scaleType([contract.min, contract.max], [height - MARGIN_Y, 0])
  return (
    <div ref={containerRef}>
      {width && (
        <SingleValueHistoryChart
          w={width}
          h={height}
          xScale={xScale}
          yScale={yScale}
          data={data}
          color="#5fa5f9"
        />
      )}
    </div>
  )
}

export const BinaryContractChart = (props: {
  contract: BinaryContract
  bets: Bet[]
  height?: number
}) => {
  const { contract, bets } = props
  const data = useMemo(() => getChartData(contract, bets), [contract, bets])
  const isMobile = useIsMobile(800)
  const containerRef = useRef<HTMLDivElement>(null)
  const width = useElementWidth(containerRef) ?? 0
  const height = props.height ?? isMobile ? 150 : 250
  const xScale = d3.scaleTime(getDateRange(contract), [0, width - MARGIN_X])
  const yScale = d3.scaleLinear([0, 1], [height - MARGIN_Y, 0])
  return (
    <div ref={containerRef}>
      {width && (
        <SingleValueHistoryChart
          w={width}
          h={height}
          xScale={xScale}
          yScale={yScale}
          data={data}
          color="#11b981"
          pct
        />
      )}
    </div>
  )
}

export const ChoiceContractChart = (props: {
  contract: FreeResponseContract | MultipleChoiceContract
  bets: Bet[]
  height?: number
}) => {
  const { contract, bets } = props
  const data = useMemo(
    () => getMultiChartData(contract, bets),
    [contract, bets]
  )
  const isMobile = useIsMobile(800)
  const containerRef = useRef<HTMLDivElement>(null)
  const width = useElementWidth(containerRef) ?? 0
  const height = props.height ?? isMobile ? 150 : 250
  const xScale = d3.scaleTime(getDateRange(contract), [0, width - MARGIN_X])
  const yScale = d3.scaleLinear([0, 1], [height - MARGIN_Y, 0])
  return (
    <div ref={containerRef}>
      {width && (
        <MultiValueHistoryChart
          w={width}
          h={height}
          xScale={xScale}
          yScale={yScale}
          data={data.points}
          colors={d3.schemeCategory10}
          labels={data.labels}
          pct
        />
      )}
    </div>
  )
}
