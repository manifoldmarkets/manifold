import { useState, useEffect } from 'react'
import { AppState, AppStateStatus } from 'react-native'

export const useIsPageVisible = () => {
  const [isPageVisible, setIsPageVisible] = useState(
    AppState.currentState === 'active'
  )

  useEffect(() => {
    const updateVisibility = (nextAppState: AppStateStatus) => {
      setIsPageVisible(nextAppState === 'active')
    }

    const subscription = AppState.addEventListener('change', updateVisibility)
    return () => {
      subscription.remove()
    }
  }, [])

  return isPageVisible
}
