import { getDeviceId } from '@amplitude/analytics-browser'
import { useEffect, useState } from 'react'
import { track } from 'web/lib/service/analytics'

const TEST_CACHE: any = {}

export const useABTest = <T>(
  testName: string,
  variants: { [variantName: string]: T },
  trackingProperties?: any
) => {
  const [variant, setVariant] = useState<T | undefined>(undefined)

  useEffect(() => {
    const deviceId = getDeviceId()
    const hash = cyrb128(deviceId + testName)[0]

    const keys = Object.keys(variants)
    const key = keys[hash % keys.length]

    setVariant(variants[key])

    // only track once per user session
    if (!TEST_CACHE[testName]) {
      TEST_CACHE[testName] = true

      track(testName, { ...trackingProperties, variant: key })
    }
  }, [testName, trackingProperties, variants])

  return variant
}

function cyrb128(str: string) {
  let h1 = 1779033703,
    h2 = 3144134277,
    h3 = 1013904242,
    h4 = 2773480762
  for (let i = 0, k; i < str.length; i++) {
    k = str.charCodeAt(i)
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067)
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233)
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213)
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179)
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067)
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233)
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213)
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179)
  return [
    (h1 ^ h2 ^ h3 ^ h4) >>> 0,
    (h2 ^ h1) >>> 0,
    (h3 ^ h1) >>> 0,
    (h4 ^ h1) >>> 0,
  ]
}
