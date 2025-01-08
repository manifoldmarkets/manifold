import {
  FontSize,
  fontSizes,
  ThemedText,
  ThemedTextProps,
} from 'components/themed-text'
import { useColor } from 'hooks/use-color'
import {
  StyleProp,
  TouchableOpacity,
  TouchableOpacityProps,
  ViewStyle,
  Platform,
  ActivityIndicator,
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
  loading?: boolean
  disabled?: boolean
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

const spinnerSizes: Record<ButtonSize, number> = {
  xs: fontSizes.xs.lineHeight, // 16
  sm: fontSizes.sm.lineHeight, // 20
  md: fontSizes.md.lineHeight, // 24
  lg: fontSizes.lg.lineHeight, // 28
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
  loading,
  disabled,
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
          background: color.errorBackground,
          text: color.error,
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
  const isDisabled = disabled || loading

  return (
    <TouchableOpacity
      style={[
        style,
        {
          backgroundColor: disabled
            ? color.backgroundSecondary
            : buttonColors.background,
          padding: sizeStyles[size].padding,
          borderRadius: sizeStyles[size].borderRadius,
          alignItems: 'center',
        },
      ]}
      disabled={isDisabled}
      onPressIn={(ev) => {
        if (isHaptic && Platform.OS === 'ios' && !isDisabled) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
        }
        onPressIn?.(ev)
      }}
      {...props}
    >
      {loading ? (
        <ActivityIndicator
          color={buttonColors.text}
          size={spinnerSizes[size]}
        />
      ) : (
        <ThemedText
          color={disabled ? color.textTertiary : buttonColors.text}
          weight="semibold"
          size={sizeStyles[size].fontSize}
          {...textProps}
        >
          {title ? title : children}
        </ThemedText>
      )}
    </TouchableOpacity>
  )
}
