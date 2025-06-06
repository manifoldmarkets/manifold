import { View, TouchableOpacity, StyleSheet } from 'react-native'
import { Period, periodDurations } from 'common/period'
import { useColor } from 'hooks/use-color'
import { ThemedText } from 'components/themed-text'
import { Rounded } from 'constants/border-radius'

const labels: { [label: string]: Period } = {
  '1H': '1hour',
  '6H': '6hour',
  '1D': 'daily',
  '1W': 'weekly',
  '1M': 'monthly',
  ALL: 'allTime',
}

export const TimeRangePicker = (props: {
  currentTimePeriod: Period
  setCurrentTimePeriod: (period: Period) => void
  maxRange?: number
  disabled?: boolean
}) => {
  const { currentTimePeriod, setCurrentTimePeriod, maxRange, disabled } = props
  const color = useColor()

  const availableOptions = !maxRange
    ? Object.entries(labels)
    : Object.entries(labels).filter(
        ([_, period]) =>
          period === 'allTime' || periodDurations[period] <= maxRange
      )

  return (
    <View style={styles.container}>
      {availableOptions.map(([label, period]) => (
        <TouchableOpacity
          key={label}
          style={[
            styles.button,
            currentTimePeriod === period && {
              backgroundColor: color.primary,
            },
          ]}
          onPress={() => setCurrentTimePeriod(period)}
          disabled={disabled}
        >
          <ThemedText
            size="sm"
            color={
              currentTimePeriod === period ? color.background : color.primary
            }
            weight="medium"
          >
            {label}
          </ThemedText>
        </TouchableOpacity>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  button: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: Rounded.sm,
    backgroundColor: 'transparent',
  },
})
