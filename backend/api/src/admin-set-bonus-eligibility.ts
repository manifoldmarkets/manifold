import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updateUser } from 'shared/supabase/users'
import { getUser, log } from 'shared/utils'
import { APIError, APIHandler } from './helpers/endpoint'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { isAdminId } from 'common/envs/constants'

export const adminSetBonusEligibility: APIHandler<
  'admin-set-bonus-eligibility'
> = async (body, auth) => {
  const { userId, bonusEligibility } = body

  // Only admins can modify bonus eligibility
  throwErrorIfNotAdmin(auth.uid)

  // Prevent modifying admin accounts
  if (isAdminId(userId)) {
    throw new APIError(403, 'Cannot modify admin account bonus eligibility')
  }

  const pg = createSupabaseDirectClient()

  // Get the user to verify they exist
  const user = await getUser(userId)
  if (!user) {
    throw new APIError(404, 'User not found')
  }

  // Update the user's bonus eligibility
  await updateUser(pg, userId, { bonusEligibility })

  log(
    `Admin ${auth.uid} set bonusEligibility to '${bonusEligibility}' for user ${userId}`
  )

  return { success: true }
}
