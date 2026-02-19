import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updatePrivateUser } from 'shared/supabase/users'
import { getPrivateUser, getUser } from 'shared/utils'
import { FieldVal } from 'shared/supabase/utils'
import { APIError, APIHandler } from './helpers/endpoint'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { trackPublicEvent } from 'shared/analytics'
import { broadcastUpdatedUser } from 'shared/websockets/helpers'
import { isAdminId } from 'common/envs/constants'
import { randomString } from 'common/util/random'

export const anonymizeUser: APIHandler<'anonymize-user'> = async (
  body,
  auth
) => {
  const { userId } = body

  // Only admins can anonymize user data
  throwErrorIfNotAdmin(auth.uid)

  // Prevent anonymizing admin accounts
  if (isAdminId(userId)) {
    throw new APIError(403, 'Cannot anonymize admin accounts')
  }

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

  // Track the anonymize action
  await trackPublicEvent(auth.uid, 'anonymize user', { userId })

  // Generate randomized username
  const randomUsername = `deleted_${randomString(8)}`
  const randomName = `Deleted User ${randomString(4)}`

  // Update public user data - remove all identifying information.
  // name and username are top-level columns, so we must update them directly
  // (updateUser only writes to the data JSONB column and would not persist these).
  await pg.none(
    `update users set
      name = $2,
      username = $3,
      data = data
        || jsonb_build_object(
             'avatarUrl', '',
             'userDeleted', true)
        - 'bio'
        - 'website'
        - 'twitterHandle'
        - 'discordHandle'
    where id = $1`,
    [userId, randomName, randomUsername]
  )
  broadcastUpdatedUser({
    id: userId,
    name: randomName,
    username: randomUsername,
    avatarUrl: '',
    bio: undefined,
    website: undefined,
    twitterHandle: undefined,
    discordHandle: undefined,
    userDeleted: true,
  })

  // Update private user data - remove identifying information
  await updatePrivateUser(pg, userId, {
    twitchInfo: FieldVal.delete(),
    // Keep email/old_e_mail for potential account recovery
    // but admins can manually delete these via Supabase if needed
  })

  return {
    success: true,
    newUsername: randomUsername,
    newName: randomName,
  }
}
