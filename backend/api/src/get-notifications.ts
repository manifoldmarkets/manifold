import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIHandler } from 'api/helpers/endpoint'
import { Notification } from 'common/notification'

export const getNotifications: APIHandler<'get-notifications'> = async (
  props,
  auth
) => {
  const { limit } = props
  const pg = createSupabaseDirectClient()
  const query = `
    select data from user_notifications
    where user_id = $1
    order by (data->'createdTime')::bigint desc
    limit $2
  `
  return await pg.map(
    query,
    [auth.uid, limit],
    (row) => row.data as Notification
  )
}
