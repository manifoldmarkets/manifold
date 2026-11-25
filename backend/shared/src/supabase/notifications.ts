import { Notification } from 'common/notification'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { bulkInsert } from 'shared/supabase/utils'
import { broadcast } from 'shared/websockets/server'

export const insertNotificationToSupabase = async (
  notification: Notification,
  pg: SupabaseDirectClient,
  showInBrowser = true
) => {
  const inserted = await pg.oneOrNone(
    `insert into public.user_notifications (user_id, notification_id, data)
     values ($1, $2, $3)
     on conflict do nothing
     returning 1 as inserted`,
    [
      notification.userId,
      notification.id,
      showInBrowser ? notification : { ...notification, deliveryOnly: true },
    ]
  )
  if (inserted && showInBrowser) {
    broadcast(`user-notifications/${notification.userId}`, { notification })
  }
  return !!inserted
}

export const bulkInsertNotifications = async (
  notifications: Notification[],
  pg: SupabaseDirectClient,
  skipBroadcast: boolean = false
) => {
  await bulkInsert(
    pg,
    'user_notifications',
    notifications.map((n) => ({
      user_id: n.userId,
      notification_id: n.id,
      data: n,
    }))
  )
  // Useful for admin notifs as broadcasting 100k notifications probably broke the site
  if (!skipBroadcast) {
    notifications.forEach((notification) =>
      broadcast(`user-notifications/${notification.userId}`, { notification })
    )
  }
}
