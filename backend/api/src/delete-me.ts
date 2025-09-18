import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updatePrivateUser, updateUser } from 'shared/supabase/users'
import { FieldVal } from 'shared/supabase/utils'
import { getPrivateUser, getUser } from 'shared/utils'
import { APIError, APIHandler } from './helpers/endpoint'

export const deleteMe: APIHandler<'me/delete'> = async (body, auth) => {
  const { username } = body
  const user = await getUser(auth.uid)
  if (!user) {
    throw new APIError(401, 'Your account was not found')
  }
  if (user.username != username) {
    throw new APIError(
      400,
      `Incorrect username. You are logged in as ${user.username}. Are you sure you want to delete this account?`
    )
  }

  const pg = createSupabaseDirectClient()
  const privateUser = await getPrivateUser(auth.uid)
  if (!privateUser) {
    throw new APIError(404, 'Your account was not found')
  }
  await updateUser(pg, auth.uid, {
    userDeleted: true,
    isBannedFromPosting: true,
  })
  await updatePrivateUser(pg, auth.uid, {
    old_e_mail: privateUser.email ?? '',
  })
  await updatePrivateUser(pg, auth.uid, {
    email: FieldVal.delete(),
    twitchInfo: FieldVal.delete(),
  })
}
