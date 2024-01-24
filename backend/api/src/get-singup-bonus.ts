import { APIError, APIHandler } from 'api/helpers/endpoint'
import { getUser } from 'shared/utils'
import { MARKET_VISIT_BONUS_TOTAL } from 'common/economy'
import { sendOnboardingMarketVisitBonus } from 'shared/onboarding-helpers'
import * as admin from 'firebase-admin'

export const getSingupBonus: APIHandler<'get-signup-bonus'> = async (
  _,
  auth
) => {
  const user = await getUser(auth.uid)
  if (!user) throw new APIError(404, 'User not found')
  if (user.signupBonusPaid === undefined) {
    throw new APIError(400, 'User not eligible')
  }
  if (user.signupBonusPaid > MARKET_VISIT_BONUS_TOTAL) {
    throw new APIError(400, 'User already received 9 signup bonuses')
  }
  const firestore = admin.firestore()
  const { txn } = await sendOnboardingMarketVisitBonus(firestore, auth.uid)
  if (!txn) {
    throw new APIError(400, 'Error sending signup bonus')
  }
  return { bonus: txn.amount }
}
