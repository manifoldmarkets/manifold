import { View } from 'react-native'

export function Spacer(props: { style?: any; w?: number; h?: number }) {
  const { w, h, style } = props

  const width = w === undefined ? undefined : w * 4 // Convert to points (1rem ≈ 16px = 4 units)
  const height = h === undefined ? undefined : h * 4

  return <View style={[{ width, height }, style]} />
}
