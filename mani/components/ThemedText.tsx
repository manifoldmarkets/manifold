import { Colors } from 'constants/Colors'
import { Text, type TextProps, StyleSheet } from 'react-native'

export type ThemedTextProps = TextProps & {
  size?: FontSize
  weight?: FontWeight
  family?: FontFamily
  italics?: boolean
  color?: string
}

export type FontSize =
  | 'xs'
  | 'sm'
  | 'md'
  | 'lg'
  | 'xl'
  | '2xl'
  | '3xl'
  | '4xl'
  | '5xl'
  | '6xl'
  | '7xl'
  | '8xl'
  | '9xl'

export type FontWeight =
  | 'thin'
  | 'light'
  | 'normal'
  | 'medium'
  | 'semibold'
  | 'bold'
  | 'black'

export type FontFamily = 'JetBrainsMono' | 'Figtree'

export function ThemedText({
  size,
  weight,
  family,
  italics,
  color,
  style,
  ...rest
}: ThemedTextProps) {
  console.log('Applied styles:', {
    weight,
    family,
    fontWeight: weight && fontWeights[weight],
    fontFamily: family && fontFamilies[family],
  })

  return (
    <Text
      style={[
        { color: color || Colors.text },
        // color && { color: color },
        size && { ...fontSizes[size] },
        weight && { ...fontWeights[weight] },
        family && { ...fontFamilies[family] },
        italics && { fontStyle: 'italic' },
        style,
      ]}
      {...rest}
    />
  )
}

const fontFamilies = StyleSheet.create({
  JetBrainsMono: {
    fontFamily: 'JetBrainsMono',
  },
  Figtree: {
    fontFamily: 'Figtree',
  },
})

const fontWeights = StyleSheet.create({
  thin: {
    fontWeight: '100',
  },
  light: {
    fontWeight: '300',
  },
  normal: {
    fontWeight: '400',
  },
  medium: {
    fontWeight: '500',
  },
  semibold: {
    fontWeight: '600',
  },
  bold: {
    fontWeight: '700',
  },
  black: {
    fontWeight: '900',
  },
})

const fontSizes = StyleSheet.create({
  xs: {
    fontSize: 12,
    lineHeight: 16,
  },
  sm: {
    fontSize: 14,
    lineHeight: 20,
  },
  md: {
    fontSize: 16,
    lineHeight: 24,
  },
  lg: {
    fontSize: 18,
    lineHeight: 28,
  },
  xl: {
    fontSize: 20,
    lineHeight: 28,
  },
  '2xl': {
    fontSize: 24,
    lineHeight: 32,
  },
  '3xl': {
    fontSize: 30,
    lineHeight: 36,
  },
  '4xl': {
    fontSize: 36,
    lineHeight: 40,
  },
  '5xl': {
    fontSize: 48,
    lineHeight: 100,
  },
  '6xl': {
    fontSize: 60,
    lineHeight: 100,
  },
  '7xl': {
    fontSize: 72,
    lineHeight: 100,
  },
  '8xl': {
    fontSize: 96,
    lineHeight: 100,
  },
  '9xl': {
    fontSize: 128,
    lineHeight: 100,
  },
})
