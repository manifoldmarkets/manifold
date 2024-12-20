import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs'
import { useColor } from 'hooks/use-color'
import { StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export default function BlurTabBarBackground() {
  const color = useColor()
  return (
    <View
      style={[StyleSheet.absoluteFill, { backgroundColor: color.background }]}
    />
  )
}

export function useBottomTabOverflow() {
  const tabHeight = useBottomTabBarHeight()
  const { bottom } = useSafeAreaInsets()
  return tabHeight - bottom
}
