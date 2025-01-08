import { Colors } from 'constants/colors'
import { ReactNode } from 'react'
import {
  StyleSheet,
  TouchableOpacity,
  Text,
  ViewStyle,
  TextStyle,
  StyleProp,
} from 'react-native'

export function PillButton(props: {
  selected: boolean
  onSelect: () => void
  xs?: boolean
  style?: StyleProp<ViewStyle>
  children: ReactNode
}) {
  const { children, selected, onSelect, xs, style } = props

  const buttonStyle: StyleProp<ViewStyle> = [styles.button, style]

  const textStyle: StyleProp<TextStyle> = [
    xs ? styles.textXs : styles.textSm,
    selected ? styles.selectedText : styles.unselectedText,
  ]

  return (
    <TouchableOpacity style={buttonStyle} onPress={onSelect}>
      <Text style={textStyle}>{children}</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  button: {
    height: 24,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 8,
    backgroundColor: Colors.grayButtonBackground,
  } as ViewStyle,
  textXs: {
    fontSize: 12,
  } as TextStyle,
  textSm: {
    fontSize: 14,
  } as TextStyle,
  selectedText: {
    color: Colors.text,
  } as TextStyle,
  unselectedText: {
    color: Colors.textQuaternary,
  } as TextStyle,
})
