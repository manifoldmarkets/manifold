import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updateUser } from 'shared/supabase/users'
import { FieldVal } from 'shared/supabase/utils'
import { getUser, log } from 'shared/utils'
import { APIError, APIHandler } from './helpers/endpoint'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { isAdminId } from 'common/envs/constants'

const markOutdated = (reason: string) =>
  reason.endsWith(' (outdated)') ? reason : `${reason} (outdated)`

export const adminSetBonusEligibility: APIHandler<
  'admin-set-bonus-eligibility'
> = async (body, auth) => {
  const { userId, bonusEligibility } = body

  throwErrorIfNotAdmin(auth.uid)

  if (isAdminId(userId)) {
    throw new APIError(403, 'Cannot modify admin account bonus eligibility')
  }

  const pg = createSupabaseDirectClient()

  const user = await getUser(userId)
  if (!user) {
    throw new APIError(404, 'User not found')
  }

  const flagReasonUpdate = user.verificationFlagReason
    ? { verificationFlagReason: markOutdated(user.verificationFlagReason) }
    : {}

  if (bonusEligibility === null) {
    // Clear the field entirely - user will be treated as "must verify"
    // for full bonus access (undefined bonusEligibility is not full access).
    await updateUser(pg, userId, {
      bonusEligibility: FieldVal.delete() as any,
      ...flagReasonUpdate,
    })
    log(
      `Admin ${auth.uid} cleared bonusEligibility for user ${userId} (must re-verify)`
    )
  } else {
    await updateUser(pg, userId, { bonusEligibility, ...flagReasonUpdate })
    log(
      `Admin ${auth.uid} set bonusEligibility to '${bonusEligibility}' for user ${userId}`
    )
  }

  return { success: true }
}
