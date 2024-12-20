import React from 'react'
import { Animated, Image, TouchableOpacity } from 'react-native'
import { Row } from './layout/row'
import { useColor } from 'hooks/use-color'
import { useTokenMode } from 'hooks/use-token-mode'

export function TokenSlider() {
  const color = useColor()
  const { token, setToken } = useTokenMode()

  const slideAnim = React.useRef(
    new Animated.Value(token === 'MANA' ? 0 : 1)
  ).current

  const toggleMode = () => {
    const newToken = token === 'MANA' ? 'CASH' : 'MANA'
    setToken(newToken)
    // Animate the slide
    Animated.spring(slideAnim, {
      toValue: newToken === 'MANA' ? 0 : 1,
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
            opacity: token === 'CASH' ? 0 : 1,
          }}
          source={require('../assets/images/masses_mana_flat.png')}
        />
        <Image
          style={{
            width: 20,
            height: 20,
            opacity: token === 'MANA' ? 0 : 1,
          }}
          source={require('../assets/images/masses_sweeps_flat.png')}
        />
      </Row>
    </TouchableOpacity>
  )
}
