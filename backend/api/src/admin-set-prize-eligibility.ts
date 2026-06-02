import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updateUser } from 'shared/supabase/users'
import { FieldVal } from 'shared/supabase/utils'
import { getUser, log } from 'shared/utils'
import { APIError, APIHandler } from './helpers/endpoint'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { isAdminId } from 'common/envs/constants'

export const adminSetPrizeEligibility: APIHandler<
  'admin-set-prize-eligibility'
> = async (body, auth) => {
  const { userId, prizeEligibility } = body

  throwErrorIfNotAdmin(auth.uid)

  if (isAdminId(userId)) {
    throw new APIError(403, 'Cannot modify admin account prize eligibility')
  }

  const pg = createSupabaseDirectClient()

  const user = await getUser(userId)
  if (!user) {
    throw new APIError(404, 'User not found')
  }

  if (prizeEligibility === null) {
    // Clear the override - prize eligibility falls back to bonus eligibility
    // (canEnterPrizeDrawings derives from canReceiveBonuses when unset)
    await updateUser(pg, userId, {
      prizeEligibility: FieldVal.delete() as any,
    })
    log(
      `Admin ${auth.uid} cleared prizeEligibility for user ${userId} (follows bonus eligibility)`
    )
  } else {
    await updateUser(pg, userId, { prizeEligibility })
    log(
      `Admin ${auth.uid} set prizeEligibility to '${prizeEligibility}' for user ${userId}`
    )
  }

  return { success: true }
}
