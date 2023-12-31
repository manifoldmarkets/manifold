import { useEffect, useState } from 'react'

export const useAdTimer = (seconds: number, visible: boolean) => {
  const [secondsLeft, setSecondsLeft] = useState(seconds)

  useEffect(() => {
    if (secondsLeft <= 0) return

    if (visible) {
      const interval = setInterval(() => {
        setSecondsLeft(secondsLeft - 1)
      }, 1000)

      return () => clearInterval(interval)
    }
  }, [secondsLeft, visible])

  return secondsLeft
}
