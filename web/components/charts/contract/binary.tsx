import { useMemo } from 'react'
import { first, last } from 'lodash'
import { scaleTime, scaleLinear } from 'd3-scale'
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
import { getVersusColors } from './choice'

export const BinaryContractChart = (props: {
  contract: BinaryContract
  betPoints: SingleContractPoint[]
  width: number
  height: number
  zoomParams?: ZoomParams
  percentBounds?: { max?: number; min?: number }
  showZoomer?: boolean
  hoveredAnnotation?: number | null
  setHoveredAnnotation?: (id: number | null) => void
  pointerMode?: PointerMode
  chartAnnotations?: ChartAnnotation[]
  graphColor?: string
}) => {
  const {
    contract,
    width,
    height,
    zoomParams,
    percentBounds,
    betPoints,
    showZoomer,
    hoveredAnnotation,
    setHoveredAnnotation,
    pointerMode = 'zoom',
    chartAnnotations,
    graphColor,
  } = props

  const start = first(betPoints)?.x ?? contract.createdTime
  const end = getEndDate(contract)
  const endP = getProbability(contract as BinaryContract)

  const now = useMemo(() => Date.now(), [betPoints])

  const data = useMemo(() => {
    return [...betPoints, { x: end ?? now, y: endP }]
  }, [end, endP, betPoints])

  const rightmostDate = getRightmostVisibleDate(end, last(betPoints)?.x, now)

  const xScale = scaleTime([start, rightmostDate], [0, width])
  const yScale = scaleLinear(
    [percentBounds?.min ?? 0, percentBounds?.max ?? 1],
    [height, 0]
  )

  return (
    <SingleValueHistoryChart
      w={width}
      h={height}
      xScale={xScale}
      yScale={yScale}
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
    />
  )
}

export const MultiBinaryChart = (props: {
  contract: CPMMMultiContract
  betPoints: SingleContractPoint[]
  width: number
  height: number
  zoomParams?: ZoomParams
  percentBounds?: { max?: number; min?: number }
  showZoomer?: boolean
}) => {
  const {
    contract,
    width,
    height,
    zoomParams,
    percentBounds,
    betPoints,
    showZoomer,
  } = props

  const start = first(betPoints)?.x ?? contract.createdTime
  const end = getEndDate(contract)
  const mainBinaryMCAnswer = contract.answers[0]
  const endP = getAnswerProbability(
    contract as CPMMMultiContract,
    mainBinaryMCAnswer.id
  )

  const [bottom, top] = getVersusColors(contract.answers)

  const now = useMemo(() => Date.now(), [betPoints])

  const data = useMemo(() => {
    return [...betPoints, { x: end ?? now, y: endP }]
  }, [end, endP, betPoints])

  const rightmostDate = getRightmostVisibleDate(end, last(betPoints)?.x, now)

  const xScale = scaleTime([start, rightmostDate], [0, width])
  const yScale = scaleLinear(
    [percentBounds?.min ?? 0, percentBounds?.max ?? 1],
    [height, 0]
  )

  return (
    <SingleValueStackedHistoryChart
      w={width}
      h={height}
      xScale={xScale}
      yScale={yScale}
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
