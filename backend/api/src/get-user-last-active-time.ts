import { APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const getUserLastActiveTime: APIHandler<
  'get-user-last-active-time'
> = async (body) => {
  const { userId } = body
  const pg = createSupabaseDirectClient()

  const result = await pg.oneOrNone(
    `select greatest(
       coalesce(ts_to_millis(date_trunc('day', last_card_view_ts)), 0),
       coalesce(ts_to_millis(date_trunc('day', last_page_view_ts)), 0),
       coalesce(ts_to_millis(date_trunc('day', last_promoted_view_ts)), 0)
     ) as last_active_time
     from user_contract_views
     where user_id = $1
       and (last_card_view_ts is not null
         or last_page_view_ts is not null
         or last_promoted_view_ts is not null)
     order by greatest(
       coalesce(ts_to_millis(date_trunc('day', last_card_view_ts)), 0),
       coalesce(ts_to_millis(date_trunc('day', last_page_view_ts)), 0),
       coalesce(ts_to_millis(date_trunc('day', last_promoted_view_ts)), 0)
       ) desc
     limit 1`,
    [userId]
  )

  return {
    lastActiveTime: result?.last_active_time || null,
  }
}
