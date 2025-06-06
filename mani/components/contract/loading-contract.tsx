// ... existing imports ...
import { Col } from 'components/layout/col'
import Page from 'components/page'
import { Rounded } from 'constants/border-radius'
import { useColor } from 'hooks/use-color'
import { View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'

// ... existing code ...

export const ContractPageLoading = () => {
  const color = useColor()
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: withRepeat(
      withSequence(
        withTiming(0.2, { duration: 1000 }),
        withTiming(1, { duration: 1000 })
      ),
      -1,
      true
    ),
  }))

  return (
    <Page>
      <Col style={{ gap: 16 }}>
        {/* Question skeleton */}
        <Animated.View
          style={[
            {
              height: 32,
              backgroundColor: color.backgroundSecondary,
              borderRadius: Rounded.lg,
              width: '80%',
            },
            animatedStyle,
          ]}
        />

        {/* Chart/overview skeleton */}
        <Animated.View
          style={[
            {
              height: 200,
              backgroundColor: color.backgroundSecondary,
              borderRadius: Rounded.lg,
            },
            animatedStyle,
          ]}
        />

        {/* Bet buttons skeleton */}
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <Animated.View
            style={[
              {
                flex: 1,
                height: 48,
                backgroundColor: color.backgroundSecondary,
                borderRadius: Rounded.lg,
              },
              animatedStyle,
            ]}
          />
          <Animated.View
            style={[
              {
                flex: 1,
                height: 48,
                backgroundColor: color.backgroundSecondary,
                borderRadius: Rounded.lg,
              },
              animatedStyle,
            ]}
          />
        </View>
      </Col>
    </Page>
  )
}
