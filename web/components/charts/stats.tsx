import { useMemo } from 'react'
import { scaleTime, scaleLinear } from 'd3-scale'
import { min, max } from 'lodash'
import dayjs from 'dayjs'

import { formatPercent } from 'common/util/format'
import { Row } from '../layout/row'
import { SingleValueHistoryChart } from './generic-charts'
import { TooltipProps } from './helpers'
import { SizedContainer } from 'web/components/sized-container'
import { HistoryPoint } from 'common/chart'
import { curveLinear } from 'd3-shape'

const getPoints = (startDate: number, dailyValues: number[]) => {
  const startDateDayJs = dayjs(startDate)
  return dailyValues.map((y, i) => ({
    x: startDateDayJs.add(i, 'day').toDate().valueOf(),
    y: y,
  }))
}

const DailyCountTooltip = (props: TooltipProps<Date, HistoryPoint>) => {
  const { nearest } = props
  return (
    <Row className="items-center gap-2">
      <span className="font-semibold">{dayjs(nearest.x).format('MMM DD')}</span>
      <span className="text-ink-600">{nearest.y}</span>
    </Row>
  )
}

const DailyPercentTooltip = (props: TooltipProps<Date, HistoryPoint>) => {
  const { nearest } = props
  return (
    <Row className="items-center gap-2">
      <span className="font-semibold">{dayjs(nearest.x).format('MMM DD')}</span>
      <span className="text-ink-600">{formatPercent(nearest.y)}</span>
    </Row>
  )
}

export function DailyChart(props: {
  startDate: number
  dailyValues: number[]
  excludeFirstDays?: number
  pct?: boolean
}) {
  const { dailyValues, startDate, excludeFirstDays, pct } = props

  const data = useMemo(
    () => getPoints(startDate, dailyValues ?? []).slice(excludeFirstDays ?? 0),
    [startDate, dailyValues, excludeFirstDays]
  )
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const minDate = min(data.map((d) => d.x))!
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const maxDate = max(data.map((d) => d.x))!
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const maxValue = max(data.map((d) => d.y))!
  return (
    <SizedContainer className="mb-10 h-[150px] pr-16 sm:h-[250px] sm:pr-0">
      {(width, height) => (
        <SingleValueHistoryChart
          w={width}
          h={height}
          xScale={scaleTime([minDate, maxDate], [0, width])}
          yScale={scaleLinear([0, maxValue], [height, 0])}
          yKind={pct ? 'percent' : 'amount'}
          data={data}
          Tooltip={pct ? DailyPercentTooltip : DailyCountTooltip}
          color="#11b981"
          curve={curveLinear}
          showZoomer
        />
      )}
    </SizedContainer>
  )
}
