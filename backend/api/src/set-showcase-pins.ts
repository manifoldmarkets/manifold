import { APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const setShowcasePins: APIHandler<'set-showcase-pins'> = async (
  { pins },
  auth
) => {
  const pg = createSupabaseDirectClient()
  await pg.none(
    `insert into user_showcase (user_id, pins, updated_at)
     values ($1, $2, now())
     on conflict (user_id)
     do update set pins = $2, updated_at = now()`,
    [auth.uid, pins]
  )
  return { success: true }
}
