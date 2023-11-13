import { APIError } from 'common/api'
import { isAdminId, isModId } from 'common/envs/constants'

export const throwErrorIfNotMod = async (userId: string) => {
  if (!isAdminId(userId) || !isModId(userId)) {
    throw new APIError(
      403,
      `User ${userId} must be an admin or trusted to perform this action.`
    )
  }
}
