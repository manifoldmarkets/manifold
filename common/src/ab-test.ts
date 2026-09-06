import { createRNG } from './util/random'

export type StandardABTestVariant = 'control' | 'treatment'

// These are permanent QA assignments for ordinary control/treatment tests.
// They make it possible to compare both experiences throughout a rollout.
// Always exclude forced accounts from experiment-effect estimates.
export const AB_TEST_ACCOUNT_OVERRIDES: Readonly<
  Record<string, StandardABTestVariant>
> = {
  cA1JupYR5AR8btHUs2xvkui7jA93: 'treatment', // @Gen
  IPTOzEqrpkWmEzh6hwvAyY9PqFb2: 'control', // @Manifold
}

export const getForcedABTestVariant = <T extends string>(
  userId: string | undefined,
  variants: readonly T[]
): T | undefined => {
  const forcedVariant = userId && AB_TEST_ACCOUNT_OVERRIDES[userId]
  return forcedVariant !== undefined &&
    variants.some((variant) => variant === forcedVariant)
    ? (forcedVariant as T)
    : undefined
}

export const getDeterministicABTestVariant = <T extends string>(
  testName: string,
  assignmentKey: string,
  variants: readonly T[],
  forcedVariant?: T
): T => {
  if (variants.length === 0) {
    throw new Error(`A/B test ${testName} must have at least one variant`)
  }
  if (forcedVariant !== undefined && variants.includes(forcedVariant)) {
    return forcedVariant
  }

  // Never mutate the caller's array: callers commonly pass shared constants.
  const orderedVariants = [...variants].sort()
  const rand = createRNG(`${testName}:${assignmentKey}`)
  return orderedVariants[Math.floor(rand() * orderedVariants.length)]
}
