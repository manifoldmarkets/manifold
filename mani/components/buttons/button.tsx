import { FontSize, ThemedText, ThemedTextProps } from 'components/themed-text'
import { useColor } from 'hooks/use-color'
import {
  StyleProp,
  TouchableOpacity,
  TouchableOpacityProps,
  ViewStyle,
  Platform,
} from 'react-native'
import * as Haptics from 'expo-haptics'
import { Rounded } from 'constants/border-radius'

type ButtonSize = 'xs' | 'sm' | 'md' | 'lg'
type ButtonVariant = 'primary' | 'gray' | 'yes' | 'no' | 'danger' // add more variants as needed

export interface ButtonProps extends TouchableOpacityProps {
  title?: string
  children?: React.ReactNode
  size?: ButtonSize
  variant?: ButtonVariant
  textProps?: ThemedTextProps
  style?: StyleProp<ViewStyle>
  isHaptic?: boolean
}

const sizeStyles: Record<
  ButtonSize,
  { padding: number; borderRadius: number; fontSize: FontSize }
> = {
  xs: {
    padding: 2,
    borderRadius: Rounded.sm,
    fontSize: 'sm',
  },
  sm: {
    padding: 3,
    borderRadius: Rounded.sm,
    fontSize: 'sm',
  },
  md: {
    padding: 4,
    borderRadius: Rounded.sm,
    fontSize: 'md',
  },
  lg: {
    padding: 8,
    borderRadius: Rounded.sm,
    fontSize: 'lg',
  },
}

export function Button({
  title,
  children,
  style,
  size = 'md',
  variant = 'primary',
  textProps,
  isHaptic,
  onPressIn,
  ...props
}: ButtonProps) {
  const color = useColor()

  const getButtonColors = (variant: ButtonVariant) => {
    switch (variant) {
      case 'yes':
        return {
          background: color.yesButtonBackground,
          text: color.yesButtonText,
        }
      case 'no':
        return {
          background: color.noButtonBackground,
          text: color.noButtonText,
        }
      case 'gray':
        return {
          background: color.grayButtonBackground,
          text: color.text,
        }
      case 'danger':
        return {
          background: color.dangerButtonBackground,
          text: color.dangerButtonText,
        }
      case 'primary':
      default:
        return {
          background: color.primaryButton,
          text: 'white',
        }
    }
  }

  const buttonColors = getButtonColors(variant)

  return (
    <TouchableOpacity
      style={[
        style,
        {
          backgroundColor: buttonColors.background,
          padding: sizeStyles[size].padding,
          borderRadius: sizeStyles[size].borderRadius,
          alignItems: 'center',
        },
      ]}
      onPressIn={(ev) => {
        if (isHaptic && Platform.OS === 'ios') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
        }
        onPressIn?.(ev)
      }}
      {...props}
    >
      <ThemedText
        color={buttonColors.text}
        weight="semibold"
        size={sizeStyles[size].fontSize}
        {...textProps}
      >
        {title ? title : children}
      </ThemedText>
    </TouchableOpacity>
  )
}
