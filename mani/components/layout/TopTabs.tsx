import {
  ScrollView,
  Pressable,
  View,
  Animated,
  LayoutChangeEvent,
} from 'react-native'
import { ReactNode, useRef, useState, useEffect } from 'react'
import { useColor } from 'hooks/useColor'
import { Col } from './col'
import { ThemedText } from 'components/ThemedText'

export type TopTab = {
  title: string
  titleElement?: ReactNode
  queryString?: string
  icon?: ReactNode // Optional icon
  onPress?: () => void
  content: ReactNode
  prerender?: boolean
}

type TopTabsProps = {
  tabs: TopTab[]
  defaultIndex?: number
  className?: string
  labelClassName?: string
  renderAllTabs?: boolean
}

export function TopTabs(props: TopTabsProps) {
  const { tabs, defaultIndex, renderAllTabs } = props
  const [activeIndex, setActiveIndex] = useState(defaultIndex ?? 0)

  const hasRenderedIndexRef = useRef(new Set<number>())
  hasRenderedIndexRef.current.add(activeIndex)
  const color = useColor()

  // Add state for tab measurements
  const [tabWidths, setTabWidths] = useState<number[]>([])
  const [tabPositions, setTabPositions] = useState<number[]>([])
  const translateX = useRef(new Animated.Value(0)).current

  // Update indicator position when activeIndex or measurements change
  useEffect(() => {
    if (tabPositions[activeIndex] !== undefined) {
      Animated.spring(translateX, {
        toValue: tabPositions[activeIndex],
        useNativeDriver: true,
        tension: 200,
        friction: 20,
      }).start()
    }
  }, [activeIndex, tabPositions])

  return (
    <Col>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{
          backgroundColor: color.background,
        }}
        contentContainerStyle={{
          gap: 24,
        }}
      >
        {tabs.map((tab, i) => (
          <Pressable
            key={tab.queryString ?? tab.title}
            onPress={() => {
              setActiveIndex(i)
              tab.onPress?.()
            }}
            onLayout={(e: LayoutChangeEvent) => {
              const { width, x } = e.nativeEvent.layout
              setTabWidths((prev) => {
                const newWidths = [...prev]
                newWidths[i] = width
                return newWidths
              })
              setTabPositions((prev) => {
                const newPositions = [...prev]
                newPositions[i] = x
                return newPositions
              })
            }}
            style={{
              paddingVertical: 8,
              position: 'relative',
            }}
          >
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
            >
              {tab.icon}
              <ThemedText
                size="md"
                weight="medium"
                color={activeIndex === i ? color.primary : color.textTertiary}
              >
                {tab.titleElement ?? tab.title}
              </ThemedText>
            </View>
          </Pressable>
        ))}

        {/* Single animated indicator */}
        <Animated.View
          style={{
            position: 'absolute',
            bottom: 0,
            height: 2,
            backgroundColor: color.primary,
            width: tabWidths[activeIndex] || 0,
            transform: [{ translateX }],
          }}
        />
      </ScrollView>
      {tabs
        .map((tab, i) => ({ tab, i }))
        .filter(
          ({ tab, i }) =>
            renderAllTabs || tab.prerender || hasRenderedIndexRef.current.has(i)
        )
        .map(({ tab, i }) => (
          <View
            key={i}
            style={{
              display: i === activeIndex ? 'flex' : 'none',
            }}
          >
            {tab.content}
          </View>
        ))}
    </Col>
  )
}
