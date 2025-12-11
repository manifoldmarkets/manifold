import { createSupabaseDirectClient } from 'shared/supabase/init'
import {
  broadcastAllNotificationsRead,
  broadcastNotificationsRead,
} from 'shared/websockets/helpers'
import { APIHandler, authEndpoint } from './helpers/endpoint'

export const markallnotifications = authEndpoint(async (_req, auth) => {
  const pg = createSupabaseDirectClient()
  await pg.none(
    `update user_notifications
     SET data = jsonb_set(data, '{isSeen}', 'true'::jsonb)
    where user_id = $1
    and data->>'isSeen' = 'false'`,
    [auth.uid]
  )

  broadcastAllNotificationsRead(auth.uid, Date.now())

  return { success: true }
})

export const markNotificationRead: APIHandler<
  'mark-notification-read'
> = async (props, auth) => {
  const { notificationId } = props
  const pg = createSupabaseDirectClient()

  await pg.none(
    `update user_notifications set data = jsonb_set(data, '{markedAsRead}', 'true'::jsonb) where notification_id = $1 and user_id = $2`,
    [notificationId, auth.uid]
  )

  broadcastNotificationsRead(auth.uid, [notificationId])

  return { success: true }
}

export const markNotificationsRead: APIHandler<
  'mark-notifications-read'
> = async (props, auth) => {
  const { notificationIds } = props
  if (notificationIds.length === 0) return { success: true }

  const pg = createSupabaseDirectClient()

  await pg.none(
    `update user_notifications set data = jsonb_set(data, '{markedAsRead}', 'true'::jsonb) where notification_id = ANY($1) and user_id = $2`,
    [notificationIds, auth.uid]
  )

  broadcastNotificationsRead(auth.uid, notificationIds)

  return { success: true }
}
