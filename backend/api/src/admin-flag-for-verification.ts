import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updateUser } from 'shared/supabase/users'
import { FieldVal } from 'shared/supabase/utils'
import { getUser, log } from 'shared/utils'
import { APIError, APIHandler } from './helpers/endpoint'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { isAdminId } from 'common/envs/constants'

// Dedicated admin endpoint for flipping a user into the 'requires_verification'
// bonus state — separate from admin-set-bonus-eligibility because:
//   - Flagging is a specific, audit-worthy action (suspected alt, fraud signal,
//     manual review) that deserves its own log line and a required reason
//     workflow distinct from the generic state setter.
//   - It keeps the simple eligibility setter focused on verified / grandfathered
//     / ineligible without overloading it with the flag-with-reason workflow.
//
// flag: true  → bonusEligibility = 'requires_verification', stores reason
// flag: false → clears both fields; user reverts to default (still
//               bonus-blocked until they verify, but without flag context)
//
// Important: this does NOT touch prizeEligibility. The two axes stay
// independent — flagging a user for bonus verification doesn't automatically
// pull their prize eligibility, and vice versa.
export const adminFlagForVerification: APIHandler<
  'admin-flag-for-verification'
> = async (body, auth) => {
  const { userId, flag, reason } = body

  throwErrorIfNotAdmin(auth.uid)

  if (isAdminId(userId)) {
    throw new APIError(403, 'Cannot flag an admin account')
  }

  const pg = createSupabaseDirectClient()

  const user = await getUser(userId)
  if (!user) {
    throw new APIError(404, 'User not found')
  }

  if (flag) {
    const update: Record<string, unknown> = {
      bonusEligibility: 'requires_verification',
    }
    if (reason !== undefined) {
      update.verificationFlagReason = reason
    }
    await updateUser(pg, userId, update as any)
    log(
      `Admin ${auth.uid} flagged user ${userId} for verification${
        reason ? ` (reason: ${reason})` : ''
      }`
    )
  } else {
    await updateUser(pg, userId, {
      bonusEligibility: FieldVal.delete() as any,
      verificationFlagReason: FieldVal.delete() as any,
    })
    log(`Admin ${auth.uid} cleared verification flag for user ${userId}`)
  }

  return { success: true }
}
