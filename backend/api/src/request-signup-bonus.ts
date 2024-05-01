import { APIHandler } from 'api/helpers/endpoint'
import { sendOnboardingMarketVisitBonus } from 'shared/onboarding-helpers'

export const requestSignupBonus: APIHandler<'request-signup-bonus'> = async (
  _,
  auth
) => {
  const txn = await sendOnboardingMarketVisitBonus(auth.uid)

  return { bonus: txn.amount }
}
