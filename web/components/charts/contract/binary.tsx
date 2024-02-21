import { useMemo } from 'react'
import { first, last } from 'lodash'
import { scaleTime, scaleLinear } from 'd3-scale'
import { getAnswerProbability, getProbability } from 'common/calculate'
import {
  BinaryContract,
  CPMMMultiContract,
  getMainBinaryMCAnswer,
} from 'common/contract'
import {
  getEndDate,
  getRightmostVisibleDate,
  formatPct,
  ZoomParams,
  PointerMode,
} from '../helpers'
import { SingleValueHistoryChart } from '../generic-charts'
import { YES_GRAPH_COLOR } from 'common/envs/constants'
import { SingleContractChartTooltip, SingleContractPoint } from './single-value'
import { ChartAnnotation } from 'common/supabase/chart-annotations'

export const BinaryContractChart = (props: {
  contract: BinaryContract | CPMMMultiContract
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
  } = props

  const start = first(betPoints)?.x ?? contract.createdTime
  const end = getEndDate(contract)
  const mainAnswer = getMainBinaryMCAnswer(contract)
  const endP =
    mainAnswer && contract
      ? getAnswerProbability(contract as CPMMMultiContract, mainAnswer.id)
      : getProbability(contract as BinaryContract)

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
      color={YES_GRAPH_COLOR}
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
