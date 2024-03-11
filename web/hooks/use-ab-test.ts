import { createRNG } from 'common/util/random'
import { useState } from 'react'
import { ensureDeviceToken } from 'web/components/auth-context'
import { track } from 'web/lib/service/analytics'
import { useEffectCheckEquality } from './use-effect-check-equality'

const AB_TEST_CACHE: { [testName: string]: boolean } = {}

export const useABTest = <T>(
  testName: string,
  variants: { [variantName: string]: T },
  trackingProperties?: any
) => {
  const [variant, setVariant] = useState<T | undefined>(undefined)

  useEffectCheckEquality(() => {
    const deviceId = ensureDeviceToken()
    if (!deviceId) return

    const rand = createRNG(testName + deviceId)
    const keys = Object.keys(variants).sort()
    const key = keys[Math.floor(rand() * keys.length)]

    setVariant(variants[key])

    // only track once per user session
    if (!AB_TEST_CACHE[testName]) {
      AB_TEST_CACHE[testName] = true

      track(testName, { ...trackingProperties, variant: key })
    }
  }, [testName, trackingProperties, variants])

  return variant
}
