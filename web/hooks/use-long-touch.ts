import { useState, useEffect, useCallback } from 'react'

/**
 * Function to for dual functionality of button, on touch and on long touch (ms)
 * This only works for touch, clicking will only do on click, as the intent of this function is to have a substitute for hover on touch devices
 *
 * KNOWN BUG: going from touch to clicking in the same session will require a refresh for the button to work, because touch overrides click
 */
export default function useLongTouch(
  onLongTouch = () => {},
  onClick = () => {},
  ms = 500
) {
  const [startLongTouch, setStartLongTouch] = useState(false)
  const [mouseState, setMouseState] = useState<
    null | 'startPress' | 'endPress' | 'startTouch' | 'endTouch'
  >(null)
  const [timerId, setTimerId] = useState<
    ReturnType<typeof setTimeout> | undefined
  >(undefined)

  useEffect(() => {
    if (mouseState === 'endPress') {
      onClick()
    } else if (mouseState === 'endTouch') {
      clearTimeout(timerId)
      if (!startLongTouch) {
        onClick()
      }
      setStartLongTouch(false)
    } else if (mouseState === 'startTouch') {
      setTimerId(
        setTimeout(() => {
          onLongTouch()
          setStartLongTouch(true)
        }, ms)
      )
    }
  }, [mouseState])

  return {
    onMouseDown: () => {
      if (mouseState != 'startTouch' && mouseState != 'endTouch') {
        setMouseState('startPress')
      }
    },
    onMouseUp: () => {
      if (mouseState === 'startPress') {
        setMouseState('endPress')
      }
    },
    onTouchStart: () => {
      setMouseState('startTouch')
    },
    onTouchEnd: () => {
      setMouseState('endTouch')
    },
  }
}
