import { useEffect } from 'react'
import { track } from 'web/lib/service/analytics'
import { inIframe } from './use-is-iframe'

export const useTracking = (
  eventName: string,
  eventProperties?: any,
  excludeIframe?: boolean
) => {
  useEffect(() => {
    if (excludeIframe && inIframe()) return
    track(eventName, eventProperties)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventName, excludeIframe])
}
