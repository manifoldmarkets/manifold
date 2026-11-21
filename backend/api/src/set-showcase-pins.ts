import { APIError, APIHandler } from 'api/helpers/endpoint'
import { onlyUsersWhoCanPerformAction } from 'api/helpers/rate-limit'
import { getTrophyClaims } from 'api/helpers/trophies'
import { getShowcasePinsError } from 'common/trophies'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const setShowcasePins: APIHandler<'set-showcase-pins'> =
  onlyUsersWhoCanPerformAction('setShowcasePins', async ({ pins }, auth) => {
    const pg = createSupabaseDirectClient()
    const claims = await getTrophyClaims(pg, auth.uid)
    const error = getShowcasePinsError(pins, claims)
    if (error) throw new APIError(400, error)

    await pg.none(
      `insert into user_showcase (user_id, pins, updated_at)
       values ($1, $2, now())
       on conflict (user_id)
       do update set pins = excluded.pins, updated_at = now()`,
      [auth.uid, pins]
    )
    return { pins }
  })
