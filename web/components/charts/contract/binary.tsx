import { useMemo } from 'react'
import { first, last, minBy, maxBy } from 'lodash'
import { scaleTime, scaleLinear } from 'd3-scale'
import clsx from 'clsx'

import { getAnswerProbability, getProbability } from 'common/calculate'
import { BinaryContract, CPMMMultiContract } from 'common/contract'
import {
  getEndDate,
  getRightmostVisibleDate,
  formatPct,
  ZoomParams,
  PointerMode,
} from '../helpers'
import {
  SingleValueHistoryChart,
  SingleValueStackedHistoryChart,
} from '../generic-charts'
import { YES_GRAPH_COLOR } from 'common/envs/constants'
import {
  MultiBinaryChartTooltip,
  SingleContractChartTooltip,
  SingleContractPoint,
} from './single-value'
import { ChartAnnotation } from 'common/supabase/chart-annotations'
import { getAnswerColor } from './choice'
import { HistoryPoint } from 'common/chart'
import { Bet } from 'common/bet'
import { SizedContainer } from 'web/components/sized-container'
import { ChartAnnotations } from '../chart-annotations'
import { buildArray } from 'common/util/array'

export const GRAPH_Y_DIVISOR = 20

const getVisibleYRange = (params: {
  data: SingleContractPoint[]
  zoomY?: boolean
  zoomParams?: ZoomParams
}) => {
  const { data, zoomY, zoomParams } = params

  if (!zoomY || !zoomParams?.xScale) return [0, 1]

  const [minXDate, maxXDate] = zoomParams?.viewXScale.domain() ?? [null, null]
  const [fullMin, fullMax] = zoomParams.xScale.domain()

  if (
    minXDate.getTime() === fullMin.getTime() &&
    maxXDate.getTime() === fullMax.getTime()
  ) {
    return [0, 1]
  }

  const minYValue = zoomY
    ? Math.max(
        Math.floor((minBy(data, 'y')?.y ?? 0) * GRAPH_Y_DIVISOR) /
          GRAPH_Y_DIVISOR,
        0
      )
    : 0
  const maxYValue = zoomY
    ? Math.min(
        Math.ceil((maxBy(data, 'y')?.y ?? 1) * GRAPH_Y_DIVISOR) /
          GRAPH_Y_DIVISOR,
        1
      )
    : 1

  return [minYValue, maxYValue]
}

export const BinaryContractChart = (props: {
  contract: BinaryContract
  betPoints: SingleContractPoint[]
  width: number
  height: number
  zoomParams?: ZoomParams
  showZoomer?: boolean
  hoveredAnnotation?: number | null
  setHoveredAnnotation?: (id: number | null) => void
  pointerMode?: PointerMode
  chartAnnotations?: ChartAnnotation[]
  graphColor?: string
  noWatermark?: boolean
  zoomY?: boolean
  startTime?: number
}) => {
  const {
    contract,
    width,
    height,
    zoomParams,
    betPoints,
    showZoomer,
    hoveredAnnotation,
    setHoveredAnnotation,
    pointerMode = 'zoom',
    chartAnnotations,
    graphColor,
    noWatermark,
    zoomY,
    startTime,
  } = props

  const start =
    startTime ?? Math.min(first(betPoints)?.x ?? Infinity, contract.createdTime)
  const end = getEndDate(contract)
  const endP = getProbability(contract as BinaryContract)
  const stringifiedBetPoints = JSON.stringify(betPoints)

  const now = useMemo(() => Date.now(), [stringifiedBetPoints, endP])

  const data = useMemo(() => {
    return buildArray(
      !contract.lastBetTime && {
        x: start,
        y: contract.initialProbability ?? 0.5,
      }, // binary markets before 3-16-2022 have no initialProbability
      ...betPoints,
      { x: end ?? now, y: endP }
    )
  }, [end, endP, betPoints])

  const rightmostDate = getRightmostVisibleDate(end, last(betPoints)?.x, now)

  const xScale = scaleTime([start, rightmostDate], [0, width])

  const [minYValue, maxYValue] = getVisibleYRange({
    data,
    zoomY,
    zoomParams,
  })
  const yScale = scaleLinear([minYValue, maxYValue], [height, 0])

  return (
    <SingleValueHistoryChart
      w={width}
      h={height}
      xScale={xScale}
      yScale={yScale}
      rightmostDate={rightmostDate}
      zoomParams={zoomParams}
      showZoomer={showZoomer}
      yKind="percent"
      data={data}
      color={graphColor ?? YES_GRAPH_COLOR}
      Tooltip={(props) => (
        <SingleContractChartTooltip
          ttProps={props}
          xScale={zoomParams?.viewXScale ?? xScale}
          formatY={formatPct}
        />
      )}
      contractId={contract.id}
      hoveredAnnotation={hoveredAnnotation}
      setHoveredAnnotation={setHoveredAnnotation}
      pointerMode={pointerMode}
      chartAnnotations={chartAnnotations}
      noWatermark={noWatermark}
    />
  )
}

export function SizedBinaryChart(props: {
  showZoomer?: boolean
  zoomParams?: ZoomParams
  showAnnotations?: boolean
  betPoints: HistoryPoint<Partial<Bet>>[]
  contract: BinaryContract
  className?: string
  size?: 'sm' | 'md'
  color?: string
  hoveredAnnotation?: number | null
  setHoveredAnnotation?: (id: number | null) => void
  pointerMode?: PointerMode
  chartAnnotations?: ChartAnnotation[]
  noWatermark?: boolean
  zoomY?: boolean
  startTime?: number
}) {
  const {
    showZoomer,
    zoomParams,
    showAnnotations,
    betPoints,
    contract,
    className,
    size = 'md',
    pointerMode,
    setHoveredAnnotation,
    hoveredAnnotation,
    chartAnnotations,
    noWatermark,
    zoomY,
    startTime,
  } = props

  return (
    <>
      <SizedContainer
        className={clsx(
          showZoomer ? 'mb-12' : '',
          'w-full pb-3 pr-10',
          size == 'sm' ? 'h-[100px]' : 'h-[150px] sm:h-[250px]',
          className
        )}
      >
        {(w, h) => (
          <BinaryContractChart
            width={w}
            height={h}
            betPoints={betPoints}
            showZoomer={showZoomer}
            zoomParams={zoomParams}
            contract={contract}
            hoveredAnnotation={hoveredAnnotation}
            setHoveredAnnotation={setHoveredAnnotation}
            pointerMode={pointerMode}
            chartAnnotations={chartAnnotations}
            noWatermark={noWatermark}
            zoomY={zoomY}
            startTime={startTime}
          />
        )}
      </SizedContainer>
      {showAnnotations && chartAnnotations?.length ? (
        <ChartAnnotations
          annotations={chartAnnotations}
          hoveredAnnotation={hoveredAnnotation}
          setHoveredAnnotation={setHoveredAnnotation}
        />
      ) : null}
    </>
  )
}

export const MultiBinaryChart = (props: {
  contract: CPMMMultiContract
  betPoints: SingleContractPoint[]
  width: number
  height: number
  zoomParams?: ZoomParams
  showZoomer?: boolean
  zoomY?: boolean
}) => {
  const { contract, width, height, zoomParams, betPoints, showZoomer, zoomY } =
    props

  const start = first(betPoints)?.x ?? contract.createdTime
  const end = getEndDate(contract)
  const mainBinaryMCAnswer = contract.answers[0]
  const endP = getAnswerProbability(
    contract as CPMMMultiContract,
    mainBinaryMCAnswer.id
  )

  const [bottom, top] = contract.answers.map(getAnswerColor)
  const stringifiedBetPoints = JSON.stringify(betPoints)
  const now = useMemo(() => Date.now(), [stringifiedBetPoints, endP])

  const data = useMemo(() => {
    return [{ x: start, y: 0.5 }, ...betPoints, { x: end ?? now, y: endP }]
  }, [end, endP, betPoints])

  const rightmostDate = getRightmostVisibleDate(end, last(betPoints)?.x, now)

  const xScale = scaleTime([start, rightmostDate], [0, width])

  const [minYValue, maxYValue] = getVisibleYRange({
    data,
    zoomY,
    zoomParams,
  })

  const yScale = scaleLinear([minYValue, maxYValue], [height, 0])

  return (
    <SingleValueStackedHistoryChart
      w={width}
      h={height}
      xScale={xScale}
      yScale={yScale}
      rightmostDate={rightmostDate}
      zoomParams={zoomParams}
      showZoomer={showZoomer}
      data={data}
      topColor={top}
      bottomColor={bottom}
      Tooltip={(props) => (
        <MultiBinaryChartTooltip
          ttProps={props}
          xScale={zoomParams?.viewXScale ?? xScale}
          topColor={top}
          topLabel={contract.answers[1].text}
          bottomColor={bottom}
          bottomLabel={contract.answers[0].text}
        />
      )}
    />
  )
}
