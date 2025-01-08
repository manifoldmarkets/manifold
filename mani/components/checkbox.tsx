import { TouchableOpacity, StyleSheet, View } from 'react-native'
import { Text } from 'components/text'
import { Colors } from 'constants/colors'
import { Check } from 'components/icons/check'

export const CheckBox = ({
  checked,
  onPress,
  label,
  disabled,
}: {
  checked: boolean
  onPress: () => void
  label: string
  disabled?: boolean
}) => {
  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      disabled={disabled}
    >
      <View
        style={[
          styles.checkbox,
          checked && styles.checked,
          disabled && styles.disabled,
        ]}
      >
        {checked && <Check size={16} color={Colors.text} />}
      </View>
      <Text style={[styles.label, disabled && styles.disabledText]}>
        {label}
      </Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checked: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    flex: 1,
    fontSize: 14,
  },
  disabledText: {
    opacity: 0.5,
  },
})
