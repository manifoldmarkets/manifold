import { StyleSheet, View } from 'react-native'
import Animated, { useAnimatedRef } from 'react-native-reanimated'
import { TokenToggleHeader } from './layout/token-toggle-header'
import { useBottomTabOverflow } from './ui/tab-bar-background.ios'
import { ThemedView } from './themed-view'
import { Colors } from 'constants/colors'
import { usePathname } from 'expo-router'

const HEADER_HEIGHT = 250
export const PAGE_PADDING = 20

export const TabPaths = ['/', '/live', '/notifications', '/shop', 'profile']
export function isTabPath(pathname: string) {
  return TabPaths.includes(pathname)
}

export default function Page({
  children,
  nonScrollableChildren,
}: {
  children: React.ReactNode
  nonScrollableChildren?: React.ReactNode
}) {
  const scrollRef = useAnimatedRef<Animated.ScrollView>()
  const pathname = usePathname()
  const isInTabs = isTabPath(pathname)
  const bottom = isInTabs ? useBottomTabOverflow() : 0

  return (
    <View style={styles.container}>
      <TokenToggleHeader />
      <Animated.ScrollView
        ref={scrollRef}
        scrollEventThrottle={16}
        scrollIndicatorInsets={{ bottom }}
        contentContainerStyle={{ paddingBottom: bottom }}
      >
        <ThemedView style={styles.content}>
          <View style={styles.contentPadding}>{children}</View>
        </ThemedView>
      </Animated.ScrollView>
      {nonScrollableChildren}
    </View>
  )
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    height: HEADER_HEIGHT,
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    gap: 16,
    overflow: 'hidden',
    paddingBottom: 60,
  },
  contentPadding: {
    paddingHorizontal: PAGE_PADDING,
  },
})
