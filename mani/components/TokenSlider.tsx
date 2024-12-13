import React from 'react'
import { Animated, Image, TouchableOpacity } from 'react-native'
import { Row } from './layout/row'
import { useColor } from 'hooks/useColor'
import { useTokenMode } from 'hooks/useTokenMode'

export function TokenSlider() {
  const color = useColor()
  const { mode, setMode } = useTokenMode()

  const slideAnim = React.useRef(
    new Animated.Value(mode === 'play' ? 0 : 1)
  ).current

  const toggleMode = () => {
    const newMode = mode === 'play' ? 'sweep' : 'play'
    setMode(newMode)
    // Animate the slide
    Animated.spring(slideAnim, {
      toValue: newMode === 'play' ? 0 : 1,
      useNativeDriver: true,
    }).start()
  }

  return (
    <TouchableOpacity onPress={toggleMode}>
      <Row
        style={{
          gap: 2,
          backgroundColor: color.sliderBackground,
          padding: 2,
          borderRadius: 20,
          alignItems: 'center',
          height: 'auto',
        }}
      >
        {/* Add sliding indicator */}
        <Animated.View
          style={{
            width: 24,
            height: 24,
            borderRadius: 20,
            backgroundColor: 'white',
            position: 'absolute',
            transform: [
              {
                translateX: slideAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 22], // Slide distance
                }),
              },
            ],
            opacity: 0.3,
          }}
        />
        <Image
          style={{
            width: 20,
            height: 20,
            opacity: mode === 'sweep' ? 0 : 1,
          }}
          source={require('../assets/images/masses_mana_flat.png')}
        />
        <Image
          style={{
            width: 20,
            height: 20,
            opacity: mode === 'play' ? 0 : 1,
          }}
          source={require('../assets/images/masses_sweeps_flat.png')}
        />
      </Row>
    </TouchableOpacity>
  )
}
