import { APIHandler } from 'api/helpers/endpoint'
import { Notification } from 'common/notification'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const getNotifications: APIHandler<'get-notifications'> = async (
  props,
  auth
) => {
  const { limit, after } = props
  const pg = createSupabaseDirectClient()
  // Always return ALL pinned notifications (markedAsRead = false) plus recent regular notifications
  // This ensures pinned notifications are never lost due to pagination limits
  const query = `
    select data from (
      select data, (data->'createdTime')::bigint as created_time
      from user_notifications
      where user_id = $1
      and (data->>'markedAsRead')::boolean = false

      union all

      select * from (
        select data, (data->'createdTime')::bigint as created_time
        from user_notifications
        where user_id = $1
        and (data->>'markedAsRead')::boolean is distinct from false
        and ($3::bigint is null or (data->'createdTime')::bigint > $3)
        order by created_time desc
        limit $2
      ) as recent
    ) as combined
    order by created_time desc
  `
  return await pg.map(
    query,
    [auth.uid, limit, after],
    (row) => row.data as Notification
  )
}
