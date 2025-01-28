import { createSupabaseDirectClient } from 'shared/supabase/init'
import { type APIHandler } from './helpers/endpoint'

export const markallnotificationsnew: APIHandler<
  'mark-all-notifications-new'
> = async (_req, auth) => {
  const pg = createSupabaseDirectClient()
  await pg.none(
    `update user_notifications
     SET data = jsonb_set(data, '{isSeen}', 'true'::jsonb)
    where user_id = $1
    and data->>'isSeen' = 'false'`,
    [auth.uid]
  )

  return { success: true }
}
