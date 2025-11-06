import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getPrivateUser, getUser } from 'shared/utils'
import { updatePrivateUser, updateUser } from 'shared/supabase/users'
import { APIError, APIHandler } from './helpers/endpoint'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { trackPublicEvent } from 'shared/analytics'
import { FieldVal } from 'shared/supabase/utils'

export const adminRecoverUser: APIHandler<'recover-user'> = async (body, auth) => {
  const { userId, email: manualEmail } = body

  // Only admins can recover accounts
  throwErrorIfNotAdmin(auth.uid)

  const pg = createSupabaseDirectClient()

  // Get the user to verify they exist
  const user = await getUser(userId)
  if (!user) {
    throw new APIError(404, 'User not found')
  }

  // Get private user info
  const privateUser = await getPrivateUser(userId)
  if (!privateUser) {
    throw new APIError(404, 'Private user not found')
  }

  // Determine which email to use for restoration
  let emailToRestore: string | undefined

  if (manualEmail) {
    // Admin provided a manual email
    emailToRestore = manualEmail
  } else if (privateUser.old_e_mail) {
    // Use saved old_e_mail
    emailToRestore = privateUser.old_e_mail
  }

  // Require an email for recovery
  if (!emailToRestore) {
    throw new APIError(
      400,
      'Cannot recover account: no email available. Please provide a manual email address.'
    )
  }

  // Track the recovery action
  await trackPublicEvent(auth.uid, 'recover user', { userId })

  // Restore the user account
  await updateUser(pg, userId, {
    userDeleted: false,
    isBannedFromPosting: false,
  })

  // Restore email if we have one and the current email is missing
  if (emailToRestore && !privateUser.email) {
    await updatePrivateUser(pg, userId, {
      email: emailToRestore,
    })
    // Clear old_e_mail after restoration if it was used
    if (privateUser.old_e_mail && !manualEmail) {
      await updatePrivateUser(pg, userId, {
        old_e_mail: FieldVal.delete(),
      })
    }
  }

  return { success: true }
}
