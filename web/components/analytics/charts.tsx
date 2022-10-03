import { Point, ResponsiveLine } from '@nivo/line'
import clsx from 'clsx'
import { formatPercent } from 'common/util/format'
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
      className={clsx(
        'h-[250px] w-full overflow-hidden',
        !small && 'md:h-[400px]'
      )}
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
  excludeFirstDays?: number
}) {
  const { dailyPercent, startDate, small, excludeFirstDays } = props
  const { width } = useWindowSize()

  const dates = dailyPercent.map((_, i) =>
    dayjs(startDate).add(i, 'day').toDate()
  )

  const points = zip(dates, dailyPercent)
    .map(([date, percent]) => ({
      x: date,
      y: percent,
    }))
    .slice(excludeFirstDays ?? 0)
  const data = [{ id: 'Percent', data: points, color: '#11b981' }]

  const bottomAxisTicks = width && width < 600 ? 6 : undefined

  return (
    <div
      className={clsx(
        'h-[250px] w-full overflow-hidden',
        !small && 'md:h-[400px]'
      )}
    >
      <ResponsiveLine
        data={data}
        yScale={{ type: 'linear', stacked: false }}
        xScale={{
          type: 'time',
        }}
        axisLeft={{
          format: formatPercent,
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
          return <Tooltip point={point} isPercent />
        }}
      />
    </div>
  )
}

function Tooltip(props: { point: Point; isPercent?: boolean }) {
  const { point, isPercent } = props
  return (
    <Col className="border border-gray-300 bg-white py-2 px-3">
      <div
        className="pb-1"
        style={{
          color: point.serieColor,
        }}
      >
        <strong>{point.serieId}</strong>{' '}
        {isPercent ? formatPercent(+point.data.y) : Math.round(+point.data.y)}
      </div>
      <div>{dayjs(point.data.x).format('MMM DD')}</div>
    </Col>
  )
}
