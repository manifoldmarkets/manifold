import { Point, ResponsiveLine } from '@nivo/line'
import dayjs from 'dayjs'
import { zip } from 'lodash'
import { useWindowSize } from 'web/hooks/use-window-size'
import { Col } from '../layout/col'

export function DailyCountChart(props: {
  startDate: number
  dailyCounts: number[]
  small?: boolean
}) {
  const { dailyCounts, startDate, small } = props
  const { width } = useWindowSize()

  const dates = dailyCounts.map((_, i) =>
    dayjs(startDate).add(i, 'day').toDate()
  )

  const points = zip(dates, dailyCounts).map(([date, betCount]) => ({
    x: date,
    y: betCount,
  }))
  const data = [{ id: 'Count', data: points, color: '#11b981' }]

  const bottomAxisTicks = width && width < 600 ? 6 : undefined

  return (
    <div
      className="w-full overflow-hidden"
      style={{ height: !small && (!width || width >= 800) ? 400 : 250 }}
    >
      <ResponsiveLine
        data={data}
        yScale={{ type: 'linear', stacked: false }}
        xScale={{
          type: 'time',
        }}
        axisBottom={{
          tickValues: bottomAxisTicks,
          format: (date) => dayjs(date).format('MMM DD'),
        }}
        colors={{ datum: 'color' }}
        pointSize={0}
        pointBorderWidth={1}
        pointBorderColor="#fff"
        enableSlices="x"
        enableGridX={!!width && width >= 800}
        enableArea
        margin={{ top: 20, right: 28, bottom: 22, left: 40 }}
        sliceTooltip={({ slice }) => {
          const point = slice.points[0]
          return <Tooltip point={point} />
        }}
      />
    </div>
  )
}

export function DailyPercentChart(props: {
  startDate: number
  dailyPercent: number[]
  small?: boolean
}) {
  const { dailyPercent, startDate, small } = props
  const { width } = useWindowSize()

  const dates = dailyPercent.map((_, i) =>
    dayjs(startDate).add(i, 'day').toDate()
  )

  const points = zip(dates, dailyPercent).map(([date, betCount]) => ({
    x: date,
    y: betCount,
  }))
  const data = [{ id: 'Percent', data: points, color: '#11b981' }]

  const bottomAxisTicks = width && width < 600 ? 6 : undefined

  return (
    <div
      className="w-full overflow-hidden"
      style={{ height: !small && (!width || width >= 800) ? 400 : 250 }}
    >
      <ResponsiveLine
        data={data}
        yScale={{ type: 'linear', stacked: false }}
        xScale={{
          type: 'time',
        }}
        axisLeft={{
          format: (value) => `${value}%`,
        }}
        axisBottom={{
          tickValues: bottomAxisTicks,
          format: (date) => dayjs(date).format('MMM DD'),
        }}
        colors={{ datum: 'color' }}
        pointSize={0}
        pointBorderWidth={1}
        pointBorderColor="#fff"
        enableSlices="x"
        enableGridX={!!width && width >= 800}
        enableArea
        margin={{ top: 20, right: 28, bottom: 22, left: 40 }}
        sliceTooltip={({ slice }) => {
          const point = slice.points[0]
          return <Tooltip point={point} />
        }}
      />
    </div>
  )
}

function Tooltip(props: { point: Point }) {
  const { point } = props
  return (
    <Col
      className="border bg-white py-1 px-3 "
      style={{
        border: '1px solid #ccc',
      }}
    >
      <div
        key={point.id}
        style={{
          color: point.serieColor,
          padding: '3px 0',
        }}
      >
        <strong>{point.serieId}</strong> {point.data.yFormatted}
      </div>
      <div>{dayjs(point.data.x).format('MMM DD')}</div>
    </Col>
  )
}
