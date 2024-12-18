import { Bet } from 'common/bet'
import { HistoryPoint } from 'common/chart'
import { Period } from 'common/period'
import { useColor } from 'hooks/useColor'
import { useTokenMode } from 'hooks/useTokenMode'
import { View } from 'react-native'
import { hexToRgb } from 'constants/Colors'
import { LineChart } from 'react-native-svg-charts'
import { TimeRangePicker } from './TimeRangePicker'
import { useState, useMemo } from 'react'
import dayjs from 'dayjs'
import { Row } from 'components/layout/row'
import { Col } from 'components/layout/col'

export function BinaryGraph({
  betPoints,
}: {
  betPoints: HistoryPoint<Partial<Bet>>[]
}) {
  const color = useColor()
  const { mode } = useTokenMode()
  const rgb = hexToRgb(color.primary)
  const [currentTimePeriod, setCurrentTimePeriod] = useState<Period>('allTime')

  // Filter data based on selected time period
  const filteredData = useMemo(() => {
    const now = dayjs()

    const cutoffMs = now
      .subtract(
        currentTimePeriod === 'daily'
          ? 1
          : currentTimePeriod === 'weekly'
          ? 7
          : currentTimePeriod === 'monthly'
          ? 30
          : Number.MAX_SAFE_INTEGER,
        'day'
      )
      .valueOf()

    return betPoints
      .filter((point) => point.x >= cutoffMs)
      .map((point) => point.y * 100)
  }, [betPoints, currentTimePeriod])

  // Calculate max range for TimeRangePicker
  const maxRange = useMemo(() => {
    if (betPoints.length < 2) return undefined
    const firstPoint = betPoints[0]
    const lastPoint = betPoints[betPoints.length - 1]
    return lastPoint.x - firstPoint.x
  }, [betPoints])

  // Transform data to include both x and y values for proper scaling
  const chartData = useMemo(() => {
    const now = dayjs()
    const cutoffMs = now
      .subtract(
        currentTimePeriod === 'daily'
          ? 1
          : currentTimePeriod === 'weekly'
          ? 7
          : currentTimePeriod === 'monthly'
          ? 30
          : Number.MAX_SAFE_INTEGER,
        'day'
      )
      .valueOf()

    return betPoints
      .filter((point) => point.x >= cutoffMs)
      .map((point) => ({
        x: point.x,
        y: point.y * 100,
      }))
  }, [betPoints, currentTimePeriod])

  return (
    <Col style={{ width: '100%', gap: 8 }}>
      <View style={{ width: '100%', height: 220 }}>
        <LineChart
          style={{ flex: 1 }}
          data={chartData}
          xAccessor={({ item }) => item.x}
          yAccessor={({ item }) => item.y}
          contentInset={{ left: 0, right: 0, top: 10, bottom: 10 }}
          //   curve={shape.curveNatural}
          svg={{
            strokeWidth: 2,
            stroke: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)`,
          }}
          animate={true}
          animationDuration={300}
        />
      </View>
      <Row style={{ justifyContent: 'center' }}>
        <TimeRangePicker
          currentTimePeriod={currentTimePeriod}
          setCurrentTimePeriod={setCurrentTimePeriod}
          maxRange={maxRange}
        />
      </Row>
    </Col>
  )
}
