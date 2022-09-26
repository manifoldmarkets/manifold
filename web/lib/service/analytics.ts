import {
  init,
  track,
  identify,
  setUserId,
  Identify,
} from '@amplitude/analytics-browser'

import { ENV_CONFIG } from 'common/envs/constants'

init(ENV_CONFIG.amplitudeApiKey ?? '', undefined, { includeReferrer: true })

export { track }

// Integrate Sprig

try {
  ;(function (l, e, a, p) {
    // @ts-expect-error Sprig doesn't yet have a native typescript snippet
    if (window.Sprig) return
    // @ts-expect-error Sprig doesn't yet have a native typescript snippet
    window.Sprig = function (...args) {
      // @ts-expect-error Sprig doesn't yet have a native typescript snippet
      S._queue.push(args)
    }
    // @ts-expect-error Sprig doesn't yet have a native typescript snippet
    const S = window.Sprig
    // @ts-expect-error Sprig doesn't yet have a native typescript snippet
    S.appId = a
    // @ts-expect-error Sprig doesn't yet have a native typescript snippet
    S._queue = []
    // @ts-expect-error Sprig doesn't yet have a native typescript snippet
    window.UserLeap = S
    // @ts-expect-error Sprig doesn't yet have a native typescript snippet
    a = l.createElement('script')
    // @ts-expect-error Sprig doesn't yet have a native typescript snippet
    a.async = 1
    // @ts-expect-error Sprig doesn't yet have a native typescript snippet
    a.src = e + '?id=' + S.appId
    // @ts-expect-error Sprig doesn't yet have a native typescript snippet
    p = l.getElementsByTagName('script')[0]
    // @ts-expect-error Sprig doesn't yet have a native typescript snippet
    p.parentNode.insertBefore(a, p)
  })(document, 'https://cdn.sprig.com/shim.js', ENV_CONFIG.sprigEnvironmentId)
} catch (error) {
  console.log('Error initializing Sprig, please complain to Barak', error)
}

// Convenience functions:

export const trackCallback =
  (eventName: string, eventProperties?: any) => () => {
    track(eventName, eventProperties)
  }

export const withTracking =
  (
    f: (() => void) | (() => Promise<void>),
    eventName: string,
    eventProperties?: any
  ) =>
  async () => {
    const promise = f()
    track(eventName, eventProperties)
    await promise
  }

export async function identifyUser(userId: string) {
  setUserId(userId)
}

export async function setUserProperty(property: string, value: string) {
  const identifyObj = new Identify()
  identifyObj.set(property, value)
  await identify(identifyObj)
}
