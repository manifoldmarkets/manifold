import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updatePrivateUser } from 'shared/supabase/users'
import { APIError, type APIHandler } from './helpers/endpoint'
import { broadcastUpdatedPrivateUser } from 'shared/websockets/helpers'
import {
  getDefaultNotificationPreferences,
  getSavedNotificationDestinations,
  notification_preferences,
} from 'common/user-notification-preferences'

const NOTIFICATION_PREFERENCE_KEYS = new Set(
  Object.keys(getDefaultNotificationPreferences())
)

export const updateNotifSettings: APIHandler<'update-notif-settings'> = async (
  { type, medium, enabled },
  auth
) => {
  if (!NOTIFICATION_PREFERENCE_KEYS.has(type)) {
    throw new APIError(400, 'Invalid notification preference type')
  }
  const pg = createSupabaseDirectClient()
  if (type === 'opt_out_all' && medium === 'mobile') {
    await updatePrivateUser(pg, auth.uid, {
      interestedInPushNotifications: !enabled,
    })
  }
  await pg.tx(async (tx) => {
    // Lock before resolving inherited settings so concurrent toggles keep
    // each other's changes.
    const { notificationPreferences } = await tx.one<{
      notificationPreferences: Partial<notification_preferences> | null
    }>(
      `select data->'notificationPreferences' as "notificationPreferences"
       from private_users where id = $1 for update`,
      [auth.uid]
    )
    const previousDestinations = getSavedNotificationDestinations(
      notificationPreferences ?? {},
      type
    )
    const destinations = enabled
      ? Array.from(new Set([...previousDestinations, medium]))
      : previousDestinations.filter((destination) => destination !== medium)
    await tx.none(
      `update private_users
       set data = jsonb_set(data, array['notificationPreferences', $1], $2::jsonb)
       where id = $3`,
      [type, JSON.stringify(destinations), auth.uid]
    )
  })
  broadcastUpdatedPrivateUser(auth.uid)
}
