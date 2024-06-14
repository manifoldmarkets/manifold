import { APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updatePrivateUser as updatePrivateUserData } from 'shared/supabase/users'
import { broadcastUpdatedPrivateUser } from 'shared/websockets/helpers'

export const updatePrivateUser: APIHandler<'me/private/update'> = async (
  props,
  auth
) => {
  const db = createSupabaseDirectClient()
  await updatePrivateUserData(db, auth.uid, props)
  broadcastUpdatedPrivateUser(auth.uid)
}
