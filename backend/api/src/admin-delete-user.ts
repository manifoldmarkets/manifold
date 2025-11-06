import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updatePrivateUser, updateUser } from 'shared/supabase/users'
import { FieldVal } from 'shared/supabase/utils'
import { getPrivateUser, getUser } from 'shared/utils'
import { APIError, APIHandler } from './helpers/endpoint'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { trackPublicEvent } from 'shared/analytics'
import { isAdminId } from 'common/envs/constants'

export const adminDeleteUser: APIHandler<'admin-delete-user'> = async (
  body,
  auth
) => {
  const { userId } = body

  // Only admins can delete accounts
  throwErrorIfNotAdmin(auth.uid)

  // Prevent deleting admin accounts
  if (isAdminId(userId)) {
    throw new APIError(403, 'Cannot delete admin accounts')
  }

  const pg = createSupabaseDirectClient()

  // Get the user to verify they exist
  const user = await getUser(userId)
  if (!user) {
    throw new APIError(404, 'User not found')
  }

  // Check if already deleted
  if (user.userDeleted) {
    throw new APIError(400, 'User account is already deleted')
  }

  // Get private user info
  const privateUser = await getPrivateUser(userId)
  if (!privateUser) {
    throw new APIError(404, 'Private user not found')
  }

  // Track the deletion action
  await trackPublicEvent(auth.uid, 'admin delete user', { userId })

  // Mirror the self-deletion process:
  // 1. Set userDeleted and isBannedFromPosting
  await updateUser(pg, userId, {
    userDeleted: true,
    isBannedFromPosting: true,
  })

  // 2. Save email to old_e_mail
  await updatePrivateUser(pg, userId, {
    old_e_mail: privateUser.email ?? '',
  })

  // 3. Delete email and twitchInfo
  await updatePrivateUser(pg, userId, {
    email: FieldVal.delete(),
    twitchInfo: FieldVal.delete(),
  })

  return { success: true }
}
