import {
  ScrollView,
  Pressable,
  View,
  Animated,
  LayoutChangeEvent,
} from 'react-native'
import { ReactNode, useRef, useState, useEffect } from 'react'
import { useColor } from 'hooks/use-color'
import { Col } from './col'
import { ThemedText } from 'components/themed-text'
import { IconSymbol, IconSymbolName } from 'components/ui/icon-symbol'

export type TopTab = {
  title: string
  titleElement?: ReactNode
  queryString?: string
  iconName?: string // Optional icon
  iconClassName?: string
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

type ControlledTopTabsProps = {
  tabs: TopTab[]
  activeIndex: number
  onActiveIndexChange: (index: number) => void
  className?: string
  labelClassName?: string
  renderAllTabs?: boolean
}

// Controlled version
export function ControlledTopTabs(props: ControlledTopTabsProps) {
  const { tabs, activeIndex, onActiveIndexChange, renderAllTabs } = props
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
              onActiveIndexChange(i)
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
            <Col style={{ alignItems: 'center', gap: 4 }}>
              {tab.iconName && (
                <IconSymbol
                  name={tab.iconName as IconSymbolName}
                  color={activeIndex === i ? color.primary : color.textTertiary}
                />
              )}
              <ThemedText
                size="md"
                weight="medium"
                color={activeIndex === i ? color.primary : color.textTertiary}
              >
                {tab.titleElement ?? tab.title}
              </ThemedText>
            </Col>
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

// Uncontrolled wrapper
export function TopTabs(props: TopTabsProps) {
  const { defaultIndex = 0, ...rest } = props
  const [activeIndex, setActiveIndex] = useState(defaultIndex)

  return (
    <ControlledTopTabs
      {...rest}
      activeIndex={activeIndex}
      onActiveIndexChange={setActiveIndex}
    />
  )
}
