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
import { emerald, modes } from 'constants/colors'

type ButtonSize = 'xs' | 'sm' | 'md' | 'lg'
type ButtonVariant =
  | 'primary'
  | 'gray'
  | 'yes'
  | 'no'
  | 'danger'
  | 'purple'
  | 'emerald' // add more variants as needed

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
  {
    padding: number
    borderRadius: number
    fontSize: FontSize
    paddingHorizontal: number
  }
> = {
  xs: {
    padding: 2,
    paddingHorizontal: 12,
    borderRadius: Rounded.sm,
    fontSize: 'sm',
  },
  sm: {
    padding: 3,
    paddingHorizontal: 16,
    borderRadius: Rounded.sm,
    fontSize: 'sm',
  },
  md: {
    padding: 4,
    paddingHorizontal: 18,
    borderRadius: Rounded.sm,
    fontSize: 'md',
  },
  lg: {
    padding: 8,
    paddingHorizontal: 20,
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
          background:
            size === 'lg' ? color.yesButtonText : color.yesButtonBackground,
          text: size === 'lg' ? color.background : color.yesButtonText,
        }
      case 'no':
        return {
          background:
            size === 'lg' ? color.noButtonText : color.noButtonBackground,
          text: size === 'lg' ? color.background : color.noButtonText,
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
      case 'purple':
        return {
          background: modes.MANA.primaryButton,
          text: 'white',
        }
      case 'emerald':
        return {
          background: emerald[600],
          text: 'white',
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
          ...sizeStyles[size],
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
