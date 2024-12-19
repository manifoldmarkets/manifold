import { View, TouchableOpacity, StyleSheet } from 'react-native'
import { Period } from 'common/period'
import { useColor } from 'hooks/useColor'
import { ThemedText } from 'components/ThemedText'

const labels: { [label: string]: Period } = {
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

  const periodDurations = {
    daily: 24 * 60 * 60 * 1000,
    weekly: 7 * 24 * 60 * 60 * 1000,
    monthly: 30 * 24 * 60 * 60 * 1000,
    allTime: Number.MAX_SAFE_INTEGER,
  }

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
    borderRadius: 4,
    backgroundColor: 'transparent',
  },
})
