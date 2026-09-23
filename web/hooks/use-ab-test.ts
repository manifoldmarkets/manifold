import { getDeterministicABTestVariant } from 'common/ab-test'
import { track } from 'web/lib/service/analytics'
import { ensureDeviceToken } from 'web/lib/util/device-token'
import { useEffectCheckEquality } from './use-effect-check-equality'
import { useState } from 'react'
import { auth } from 'web/lib/firebase/users'

const AB_TEST_CACHE: Record<string, boolean> = {}
const IS_LOCAL_ONLY = process.env.NEXT_PUBLIC_LOCAL_ONLY === 'true'

export type ABTestAssignment<T extends string> = {
  assignmentId: string
  assignmentUnit: 'user' | 'device'
  variant: T
}

/** Reject the brief interval where Firebase auth and app-user state differ. */
export const isABTestAssignmentCurrent = (assignmentKey?: string) => {
  if (!assignmentKey) return true
  if (IS_LOCAL_ONLY) return true
  const userId = auth.currentUser?.uid
  return userId
    ? assignmentKey === `user:${userId}`
    : assignmentKey.startsWith('device:')
}

type ABTestOptions<T extends string> = {
  isReady?: boolean
  userId?: string
  forcedVariant?: T
  trackingProperties?: Record<string, unknown>
}

export const useABTestAssignment = <T extends string>(
  testName: string,
  variants: readonly T[],
  options?: ABTestOptions<T>
) => {
  const [assignment, setAssignment] = useState<
    ABTestAssignment<T> | undefined
  >()
  const isReady = options?.isReady ?? true

  useEffectCheckEquality(() => {
    if (!isReady) return
    const assignmentUnit = options?.userId ? 'user' : 'device'
    const assignmentId = options?.userId ?? ensureDeviceToken()
    if (!assignmentId) return
    const variant = getDeterministicABTestVariant(
      testName,
      `${assignmentUnit}:${assignmentId}`,
      variants,
      options?.forcedVariant
    )

    setAssignment({ assignmentId, assignmentUnit, variant })

    // Only track once per assignment unit per browser session. If somebody
    // signs into a different account without reloading, that is a new unit.
    const cacheKey = `${testName}:${assignmentUnit}:${assignmentId}`
    if (!AB_TEST_CACHE[cacheKey]) {
      AB_TEST_CACHE[cacheKey] = true
      track(testName, {
        ...options?.trackingProperties,
        variant,
        assignmentUnit,
        forced: options?.forcedVariant !== undefined,
      })
    }
  }, [testName, variants, options, isReady])

  if (!isReady || !assignment) return undefined
  if (options?.userId) {
    return assignment.assignmentUnit === 'user' &&
      assignment.assignmentId === options.userId
      ? assignment
      : undefined
  }
  return assignment.assignmentUnit === 'device' ? assignment : undefined
}

export const useABTest = <T extends string>(
  testName: string,
  variants: readonly T[],
  options?: ABTestOptions<T>
) => useABTestAssignment(testName, variants, options)?.variant
