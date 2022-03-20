import { ResponsiveLine } from '@nivo/line'
import dayjs from 'dayjs'
import _ from 'lodash'
import { useWindowSize } from '../../hooks/use-window-size'

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

  const points = _.zip(dates, dailyCounts).map(([date, betCount]) => ({
    x: date,
    y: betCount,
  }))
  const data = [{ id: 'Count', data: points, color: '#11b981' }]

  return (
    <div
      className="w-full"
      style={{ height: !small && (!width || width >= 800) ? 400 : 250 }}
    >
      <ResponsiveLine
        data={data}
        yScale={{ type: 'linear', stacked: false }}
        xScale={{
          type: 'time',
        }}
        axisBottom={{
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
      />
    </div>
  )
}
