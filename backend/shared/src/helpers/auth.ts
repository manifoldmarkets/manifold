import { getUserSupabase } from 'shared/utils'
import { APIError } from 'common/api'
import { isAdminId, isTrustworthy } from 'common/envs/constants'

export const throwErrorIfNotMod = async (userId: string) => {
  const error = new APIError(
    403,
    `User ${userId} must be an admin or trusted to perform this action.`
  )
  if (isAdminId(userId)) return
  const user = await getUserSupabase(userId)
  if (!user) throw new APIError(403, `User ${userId} not found.`)
  if (!isTrustworthy(user.username)) {
    throw error
  }
}
