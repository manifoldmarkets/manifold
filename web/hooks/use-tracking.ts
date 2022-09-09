import { track } from '@amplitude/analytics-browser'
import { useEffect } from 'react'
import { inIframe } from './use-is-iframe'

export const useTracking = (
  eventName: string,
  eventProperties?: any,
  excludeIframe?: boolean
) => {
  useEffect(() => {
    if (excludeIframe && inIframe()) return
    track(eventName, eventProperties)
  }, [])
}
