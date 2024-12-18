import { Bet } from 'common/bet'
import { HistoryPoint } from 'common/chart'
import { Period } from 'common/period'
import { useColor } from 'hooks/useColor'
import { View } from 'react-native'
import { hexToRgb } from 'constants/Colors'
import { LineChart } from 'react-native-svg-charts'
import { TimeRangePicker } from './TimeRangePicker'
import { useState, useMemo } from 'react'
import dayjs from 'dayjs'
import { Row } from 'components/layout/row'
import { Col } from 'components/layout/col'
import { BinaryContract } from 'common/contract'

export function BinaryGraph({
  betPoints,
  contract,
}: {
  betPoints: HistoryPoint<Partial<Bet>>[]
  contract: BinaryContract
}) {
  const color = useColor()
  const rgb = hexToRgb(color.primary)
  const [currentTimePeriod, setCurrentTimePeriod] = useState<Period>('allTime')

  // Calculate max range for TimeRangePicker
  const maxRange = useMemo(() => {
    if (betPoints.length < 2) return undefined
    const firstPoint = betPoints[0]
    const lastPoint = betPoints[betPoints.length - 1]
    return lastPoint.x - firstPoint.x
  }, [betPoints])

  // Transform data to include both x and y values for proper scaling
  const chartData = useMemo(() => {
    const referenceTime =
      contract.closeTime && contract.closeTime < Date.now()
        ? dayjs(contract.closeTime)
        : dayjs()
    const latestY = betPoints[betPoints.length - 1].y * 100

    const filteredPoints =
      currentTimePeriod === 'allTime'
        ? betPoints
        : betPoints.filter(
            (point) =>
              point.x >=
              referenceTime
                .subtract(
                  currentTimePeriod === 'daily'
                    ? 1
                    : currentTimePeriod === 'weekly'
                    ? 7
                    : currentTimePeriod === 'monthly'
                    ? 30
                    : 0,
                  'day'
                )
                .valueOf()
          )

    // If filtered points is empty or has one point, create a straight line using the latest y value
    if (filteredPoints.length <= 1) {
      return [
        { x: referenceTime.subtract(1, 'day').valueOf(), y: latestY },
        { x: referenceTime.valueOf(), y: latestY },
      ]
    }

    // Normal case with multiple points
    return filteredPoints.map((point) => ({
      x: point.x,
      y: point.y * 100,
    }))
  }, [betPoints, currentTimePeriod, contract.closeTime])

  return (
    <Col style={{ width: '100%', gap: 8 }}>
      <View style={{ width: '100%', height: 220 }}>
        <LineChart
          style={{ flex: 1 }}
          data={chartData}
          xAccessor={({ item }: { item: HistoryPoint<Partial<Bet>> }) => item.x}
          yAccessor={({ item }: { item: HistoryPoint<Partial<Bet>> }) => item.y}
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
