import { useABTest } from './use-ab-test'

export const useIsBetOnboardingTest = () => {
  return useABTest('test onboarding', {
    basic: false,
    bet: true,
  })
}
