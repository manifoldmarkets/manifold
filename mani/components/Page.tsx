import type { PropsWithChildren } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { useAnimatedRef } from 'react-native-reanimated'
import { SliderHeader } from './layout/SliderHeader'
import { useBottomTabOverflow } from './ui/TabBarBackground.ios'
import { ThemedView } from './ThemedView'
import { Colors } from 'constants/Colors'
import { usePathname } from 'expo-router'

const HEADER_HEIGHT = 250

export default function Page({ children }: PropsWithChildren) {
  const scrollRef = useAnimatedRef<Animated.ScrollView>()
  const pathname = usePathname()
  const isInTabs = pathname.startsWith('/(tabs)/')
  const bottom = isInTabs ? useBottomTabOverflow() : 0

  return (
    <View style={styles.container}>
      <SliderHeader />
      <Animated.ScrollView
        ref={scrollRef}
        scrollEventThrottle={16}
        scrollIndicatorInsets={{ bottom }}
        contentContainerStyle={{ paddingBottom: bottom }}
      >
        <ThemedView style={styles.content}>{children}</ThemedView>
      </Animated.ScrollView>
    </View>
  )
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: 20,
  },
  header: {
    height: HEADER_HEIGHT,
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    gap: 16,
    overflow: 'hidden',
  },
})
