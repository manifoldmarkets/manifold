import { Notification } from 'common/notification'
import { SupabaseDirectClient } from 'shared/supabase/init'

export const insertNotificationToSupabase = async (
  notification: Notification,
  pg: SupabaseDirectClient
) => {
  return await pg.none(
    `insert into postgres.public.user_notifications (user_id, notification_id, data, fs_updated_time) values ($1, $2, $3, $4) on conflict do nothing`,
    [
      notification.userId,
      notification.id,
      notification,
      new Date().toISOString(),
    ]
  )
}
