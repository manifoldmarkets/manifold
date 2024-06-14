import { FieldValue } from 'firebase-admin/firestore'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updatePrivateUser } from 'shared/supabase/users'
import { type APIHandler } from './helpers/endpoint'
import { broadcastUpdatedPrivateUser } from 'shared/websockets/helpers'

export const updateNotifSettings: APIHandler<'update-notif-settings'> = async (
  { type, medium, enabled },
  auth
) => {
  const pg = createSupabaseDirectClient()
  if (type === 'opt_out_all' && medium === 'mobile') {
    await updatePrivateUser(pg, auth.uid, {
      interestedInPushNotifications: !enabled,
    })
  } else {
    await updatePrivateUser(pg, auth.uid, {
      [`notificationPreferences.${type}`]: enabled
        ? FieldValue.arrayUnion(medium)
        : FieldValue.arrayRemove(medium),
    })
  }

  broadcastUpdatedPrivateUser(auth.uid)
}
