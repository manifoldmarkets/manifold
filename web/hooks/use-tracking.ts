import { track } from '@amplitude/analytics-browser'
import { useEffect } from 'react'

export const useTracking = (eventName: string, eventProperties?: any) => {
  useEffect(() => {
    track(eventName, eventProperties)
  }, [])
}
