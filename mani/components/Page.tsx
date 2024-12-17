import type { PropsWithChildren, ReactElement } from 'react'
import { StyleSheet, View, Image } from 'react-native'
import Animated, {
  interpolate,
  useAnimatedRef,
  useAnimatedStyle,
  useScrollViewOffset,
} from 'react-native-reanimated'
// import { SvgUri } from "react-native-svg";
import { SafeAreaView } from 'react-native-safe-area-context'

import { TokenSlider } from './TokenSlider'
import { SliderHeader } from './layout/SliderHeader'
import { useBottomTabOverflow } from './ui/TabBarBackground.ios'
import { useColor } from 'hooks/useColor'
import { ThemedView } from './ThemedView'
import { Colors } from 'constants/Colors'
import { Stack, usePathname } from 'expo-router'

const HEADER_HEIGHT = 250

export default function Page({ children }: PropsWithChildren) {
  const scrollRef = useAnimatedRef<Animated.ScrollView>()
  const pathname = usePathname()
  const isInTabs = pathname.startsWith('/(tabs)/')
  const bottom = isInTabs ? useBottomTabOverflow() : 0

  const color = useColor()
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
