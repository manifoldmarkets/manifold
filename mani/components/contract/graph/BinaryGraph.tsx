import { Bet } from 'common/bet'
import { HistoryPoint } from 'common/chart'
import { useColor } from 'hooks/useColor'
import { useTokenMode } from 'hooks/useTokenMode'
import { Dimensions, View } from 'react-native'
import { LineChart } from 'react-native-chart-kit'
import { hexToRgb } from 'constants/Colors'

export function BinaryGraph({
  betPoints,
}: {
  betPoints: HistoryPoint<Partial<Bet>>[]
}) {
  const color = useColor()
  const { mode } = useTokenMode()

  const chartData = {
    labels: [], // We'll hide labels
    datasets: [
      {
        data: betPoints.map((point) => point.y * 100),
        color: (opacity = 1) => {
          const rgb = hexToRgb(color.primary)
          const adjustedOpacity = Math.min(opacity * 5, 1)
          return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${adjustedOpacity})`
        },
        strokeWidth: 2,
      },
    ],
  }

  const chartConfig = {
    decimalPlaces: 0,
    color: (opacity = 1) => {
      const rgb = hexToRgb(color.primary)
      return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`
    },
    labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
    propsForDots: {
      r: '0', // Hide dots
    },
    propsForBackgroundLines: {
      strokeWidth: 0, // Hide grid lines
    },
    fillShadowGradientFrom: color.primary,
    fillShadowGradientFromOpacity: 0.5,
    fillShadowGradientTo: color.background,
    fillShadowGradientToOpacity: 0,
    paddingRight: 0,
    paddingLeft: 0,
    paddingTop: 0,
    paddingBottom: 0,
  }

  return (
    <View style={{ width: '100%' }}>
      <LineChart
        data={chartData}
        width={Dimensions.get('window').width - 40}
        height={220}
        chartConfig={chartConfig}
        bezier
        withVerticalLines={false}
        withHorizontalLines={false}
        withDots={false}
        withInnerLines={false}
        withOuterLines={false}
        withVerticalLabels={false}
        withHorizontalLabels={false}
        style={{
          marginVertical: 8,
          paddingLeft: 0,
          marginLeft: 0,
          paddingRight: 0,
          marginRight: 0,
        }}
      />
    </View>
  )
}
