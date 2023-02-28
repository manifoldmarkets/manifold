import { useMemo } from 'react'
import { scaleTime, scaleLinear } from 'd3-scale'
import { min, max } from 'lodash'
import dayjs from 'dayjs'

import { formatPercent } from 'common/util/format'
import { Row } from '../layout/row'
import { HistoryPoint, SingleValueHistoryChart } from './generic-charts'
import { TooltipProps } from './helpers'
import { SizedContainer } from 'web/components/sized-container'

const MARGIN = { top: 20, right: 40, bottom: 20, left: 10 }
const MARGIN_X = MARGIN.left + MARGIN.right
const MARGIN_Y = MARGIN.top + MARGIN.bottom

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
    <SizedContainer fullHeight={250} mobileHeight={250}>
      {(width, height) => (
        <SingleValueHistoryChart
          w={width}
          h={height}
          margin={MARGIN}
          xScale={scaleTime([minDate, maxDate], [0, width - MARGIN_X])}
          yScale={scaleLinear([0, maxValue], [height - MARGIN_Y, 0])}
          yKind={pct ? 'percent' : 'amount'}
          data={data}
          Tooltip={pct ? DailyPercentTooltip : DailyCountTooltip}
          color="#11b981"
        />
      )}
    </SizedContainer>
  )
}
