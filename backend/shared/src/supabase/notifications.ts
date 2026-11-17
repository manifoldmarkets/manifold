import { Notification } from 'common/notification'
import { chunk } from 'lodash'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { bulkInsert, bulkInsertQuery } from 'shared/supabase/utils'
import { broadcast } from 'shared/websockets/server'

export const insertNotificationToSupabase = async (
  notification: Notification,
  pg: SupabaseDirectClient
) => {
  const inserted = await pg.oneOrNone(
    `insert into postgres.public.user_notifications (user_id, notification_id, data)
     values ($1, $2, $3)
     on conflict do nothing
     returning 1 as inserted`,
    [notification.userId, notification.id, notification],
    (r) => r?.inserted as 1 | undefined
  )
  if (inserted) {
    broadcast(`user-notifications/${notification.userId}`, { notification })
  }
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

/**
 * Inserts the notifications a user doesn't already have (by the primary key
 * (user_id, notification_id)), broadcasts only those, and returns them. The
 * web client adds every broadcast to its list without de-duplicating, so an
 * id must never be broadcast twice.
 */
export const insertNotificationsIfAbsent = async (
  notifications: Notification[],
  pg: SupabaseDirectClient
) => {
  const byKey = new Map(
    notifications.map((n) => [`${n.userId}\u0000${n.id}`, n] as const)
  )
  const inserted: Notification[] = []
  for (const batch of chunk([...byKey.values()], 25000)) {
    const query = bulkInsertQuery(
      'user_notifications',
      batch.map((n) => ({ user_id: n.userId, notification_id: n.id, data: n })),
      false
    )
    const rows = await pg.manyOrNone<{
      user_id: string
      notification_id: string
    }>(
      `${query} on conflict (user_id, notification_id) do nothing
       returning user_id, notification_id`
    )
    for (const row of rows) {
      const notification = byKey.get(
        `${row.user_id}\u0000${row.notification_id}`
      )
      if (notification) inserted.push(notification)
    }
  }
  inserted.forEach((notification) =>
    broadcast(`user-notifications/${notification.userId}`, { notification })
  )
  return inserted
}
