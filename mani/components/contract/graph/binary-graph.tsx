import { Bet } from 'common/bet'
import { HistoryPoint } from 'common/chart'
import { Period } from 'common/period'
import { View, PanResponder } from 'react-native'
import { hexToRgb } from 'constants/colors'
import { LineChart } from 'react-native-svg-charts'
import { TimeRangePicker } from './time-range-picker'
import { useState, useMemo, memo, useCallback } from 'react'
import dayjs from 'dayjs'
import { Row } from 'components/layout/row'
import { Col } from 'components/layout/col'
import { BinaryContract } from 'common/contract'
import { ThemedText } from 'components/themed-text'
import { useColor } from 'hooks/use-color'
import * as shape from 'd3-shape'

// see graph examples here: https://github.com/JesperLekland/react-native-svg-charts-examples

const TOOLTIP_WIDTH = 50
const TOOLTIP_HEIGHT = 20 // Height of tooltip including margin
const CHART_PADDING_TOP = TOOLTIP_HEIGHT + 4 // Add extra padding for tooltip

// Add type for tooltip position
type TooltipPosition = {
  x: number
  y: number
  date: string
  value: number
} | null

// Extract tooltip component
const ChartTooltip = memo(
  ({
    position,
    color,
    containerWidth,
  }: {
    position: NonNullable<TooltipPosition>
    color: any
    containerWidth: number
  }) => (
    <>
      <View
        style={{
          position: 'absolute',
          left: position.x,
          top: TOOLTIP_HEIGHT,
          bottom: 0,
          width: 0.5,
          backgroundColor: color.textTertiary,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: Math.min(
            Math.max(position.x - TOOLTIP_WIDTH / 2, 0),
            containerWidth - TOOLTIP_WIDTH
          ),
          bottom: '100%',
          marginBottom: 4,
          backgroundColor: color.background,
          width: TOOLTIP_WIDTH,
          alignItems: 'center',
          paddingVertical: 2,
        }}
      >
        <ThemedText size="xs" color={color.textTertiary}>
          {position.date}
        </ThemedText>
      </View>
    </>
  )
)

export function BinaryGraph({
  betPoints,
  contract,
  onScrollPositionChange,
}: {
  betPoints: HistoryPoint<Partial<Bet>>[]
  contract: BinaryContract
  onScrollPositionChange?: (percent: number | undefined) => void
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

  const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition>(null)

  const [containerWidth, setContainerWidth] = useState(0)

  // Optimize interpolation calculation
  const getInterpolatedValue = useCallback(
    (touchX: number) => {
      if (chartData.length === 0) return null

      const xRatio = touchX / containerWidth
      const timeRange = chartData[chartData.length - 1].x - chartData[0].x
      const touchTime = chartData[0].x + timeRange * xRatio

      const leftIndex = chartData.findIndex((point, i) => {
        const nextPoint = chartData[i + 1]
        return nextPoint && point.x <= touchTime && nextPoint.x >= touchTime
      })

      if (leftIndex === -1) return null

      const leftPoint = chartData[leftIndex]
      const rightPoint = chartData[leftIndex + 1] || leftPoint

      const timeDiff = rightPoint.x - leftPoint.x
      const progress = (touchTime - leftPoint.x) / timeDiff
      const interpolatedY =
        leftPoint.y + (rightPoint.y - leftPoint.y) * progress

      return {
        x: ((touchTime - chartData[0].x) / timeRange) * containerWidth,
        y: interpolatedY,
        date:
          timeRange < 24 * 60 * 60 * 1000
            ? dayjs(touchTime).format('h:mm A')
            : dayjs(touchTime).format('MMM D'),
        value: interpolatedY,
      }
    },
    [chartData, containerWidth]
  )

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (evt) => {
          const interpolated = getInterpolatedValue(evt.nativeEvent.locationX)
          if (interpolated) {
            setTooltipPosition(interpolated)
            onScrollPositionChange?.(interpolated.value)
          }
        },
        onPanResponderRelease: () => {
          setTooltipPosition(null)
          onScrollPositionChange?.(undefined)
        },
      }),
    [getInterpolatedValue, onScrollPositionChange]
  )

  return (
    <Col style={{ width: '100%', gap: 8 }}>
      <View style={{ width: '100%', height: 200 + CHART_PADDING_TOP }}>
        <View
          style={{
            flex: 1,
            paddingTop: CHART_PADDING_TOP, // Add padding to container
          }}
          {...panResponder.panHandlers}
          onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
        >
          {tooltipPosition && (
            <ChartTooltip
              position={tooltipPosition}
              color={color}
              containerWidth={containerWidth}
            />
          )}
          {chartData.length > 0 ? (
            <LineChart
              style={{ flex: 1 }}
              data={chartData}
              xAccessor={({ item }: { item: HistoryPoint<Partial<Bet>> }) =>
                item.x
              }
              yAccessor={({ item }: { item: HistoryPoint<Partial<Bet>> }) =>
                item.y
              }
              contentInset={{ left: 0, right: 0, top: 10, bottom: 10 }}
              svg={{
                strokeWidth: 2,
                stroke: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)`,
              }}
              curve={shape.curveMonotoneX}
              animate={true}
              animationDuration={300}
            />
          ) : (
            <ThemedText>No data available</ThemedText>
          )}
        </View>
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
