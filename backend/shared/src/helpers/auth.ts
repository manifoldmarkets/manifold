import { APIError } from 'common//api/utils'
import { isAdminId, isModId } from 'common/envs/constants'

export const throwErrorIfNotMod = (userId: string) => {
  if (!isAdminId(userId) && !isModId(userId)) {
    throw new APIError(
      403,
      `User ${userId} must be an admin or mod to perform this action.`
    )
  }
}
export const throwErrorIfNotAdmin = (userId: string) => {
  if (!isAdminId(userId)) {
    throw new APIError(
      403,
      `User ${userId} must be an admin to perform this action.`
    )
  }
}
