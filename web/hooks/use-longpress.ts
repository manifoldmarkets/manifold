import { useState, useEffect, useCallback } from 'react'

export default function useLongPress(
  onLongPress = () => {},
  onClick = () => {},
  ms = 1000
) {
  const [startPress, setStartPress] = useState(false)
  const [startLongPress, setStartLongPress] = useState(false)
  let timerId: ReturnType<typeof setTimeout>
  useEffect(() => {
    if (startPress) {
      timerId = setTimeout(() => {
        setStartLongPress(true)
        onLongPress()
      }, ms)
    } else {
      clearTimeout(timerId)
      if (!startLongPress) {
        onClick()
      } else {
        setStartLongPress(false)
      }
    }

    return () => {
      clearTimeout(timerId)
    }
  }, [startPress])

  const start = useCallback(() => {
    setStartPress(true)
  }, [])
  const stop = useCallback(() => {
    setStartPress(false)
  }, [])

  return {
    onMouseDown: start,
    onMouseUp: stop,
    onMouseLeave: stop,
    onTouchStart: start,
    onTouchEnd: stop,
  }
}
