import * as admin from 'firebase-admin'
import { getUser } from 'shared/utils'
import { APIError, APIHandler } from './helpers/endpoint'
import { updateUser } from 'shared/supabase/users'
import { createSupabaseDirectClient } from 'shared/supabase/init'

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
  await updateUser(pg, auth.uid, {
    userDeleted: true,
    isBannedFromPosting: true,
  })
  await firestore.doc(`private-users/${auth.uid}`).update({
    email: admin.firestore.FieldValue.delete(),
    twitchInfo: admin.firestore.FieldValue.delete(),
  })
}

const firestore = admin.firestore()
