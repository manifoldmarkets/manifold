import { createRNG } from 'common/util/random'
import { useState } from 'react'
import { ensureDeviceToken } from 'web/components/auth-context'
import { track } from 'web/lib/service/analytics'
import { useEffectCheckEquality } from './use-effect-check-equality'

const AB_TEST_CACHE: { [testName: string]: boolean } = {}

export const useABTest = <T extends string>(
  testName: string,
  variants: T[],
  trackingProperties?: any
) => {
  const [variant, setVariant] = useState<T | undefined>(undefined)

  useEffectCheckEquality(() => {
    const deviceId = ensureDeviceToken()
    if (!deviceId) return

    const rand = createRNG(testName + deviceId)
    const keys = variants.sort()
    const randomVariant = keys[Math.floor(rand() * keys.length)]

    setVariant(randomVariant)

    // only track once per user session
    if (!AB_TEST_CACHE[testName]) {
      AB_TEST_CACHE[testName] = true

      track(testName, { ...trackingProperties, variant: randomVariant })
    }
  }, [testName, trackingProperties, variants])

  return variant
}
