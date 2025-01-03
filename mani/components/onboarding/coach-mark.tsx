import {
  View,
  Modal,
  StyleSheet,
  Dimensions,
  TouchableWithoutFeedback,
  LayoutRectangle,
  ViewStyle,
} from 'react-native'
import { ThemedText } from '../themed-text'
import Animated, {
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated'

const WINDOW = Dimensions.get('window')

type CoachMarkProps = {
  visible: boolean
  target: LayoutRectangle | null // Measurements of the component to highlight
  title: string
  description: string
  onNext: () => void
  onSkip: () => void
  position?: 'top' | 'bottom' // Where to show the tooltip relative to highlight
  style?: ViewStyle
}

export function CoachMark({
  visible,
  target,
  title,
  description,
  onNext,
  onSkip,
  position = 'bottom',
  style,
}: CoachMarkProps) {
  // Calculate spotlight position
  const spotlightStyle = useAnimatedStyle(() => {
    if (!target) return {}

    const padding = 8 // Padding around the highlighted element

    return {
      position: 'absolute',
      left: withTiming(target.x - padding, {
        duration: 300,
        easing: Easing.out(Easing.ease),
      }),
      top: withTiming(target.y - padding, {
        duration: 300,
        easing: Easing.out(Easing.ease),
      }),
      width: target.width + padding * 2,
      height: target.height + padding * 2,
      borderRadius: 8,
    }
  })

  // Calculate tooltip position
  const tooltipStyle = useAnimatedStyle(() => {
    if (!target) return {}

    const tooltipHeight = 120 // Approximate height of tooltip
    const margin = 20

    return {
      position: 'absolute',
      left: target.x,
      top:
        position === 'bottom'
          ? target.y + target.height + margin
          : target.y - tooltipHeight - margin,
      width: WINDOW.width - 40, // 20px margin on each side
    }
  })

  if (!visible || !target) return null

  return (
    <Modal transparent visible={visible} animationType="fade">
      <TouchableWithoutFeedback onPress={onSkip}>
        <View style={styles.container}>
          {/* Dark overlay */}
          <View style={styles.overlay} />

          {/* Spotlight cutout */}
          <Animated.View style={[styles.spotlight, spotlightStyle]} />

          {/* Tooltip */}
          <Animated.View style={[styles.tooltip, tooltipStyle, style]}>
            <ThemedText size="lg" weight="semibold">
              {title}
            </ThemedText>
            <ThemedText size="md" style={styles.description}>
              {description}
            </ThemedText>
            <View style={styles.buttons}>
              <TouchableWithoutFeedback onPress={onSkip}>
                <ThemedText size="md" style={styles.skipButton}>
                  Skip
                </ThemedText>
              </TouchableWithoutFeedback>
              <TouchableWithoutFeedback onPress={onNext}>
                <ThemedText size="md" style={styles.nextButton}>
                  Next
                </ThemedText>
              </TouchableWithoutFeedback>
            </View>
          </Animated.View>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
  spotlight: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#fff',
  },
  tooltip: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  description: {
    marginTop: 8,
    opacity: 0.7,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
    gap: 16,
  },
  skipButton: {
    opacity: 0.7,
  },
  nextButton: {
    color: '#007AFF',
  },
})
