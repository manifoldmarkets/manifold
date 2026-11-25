import { APIError, APIHandler } from 'api/helpers/endpoint'
import { onlyUsersWhoCanPerformAction } from 'api/helpers/rate-limit'
import { assertOwnProfile, getTrophyClaims } from 'api/helpers/trophies'
import { getShowcasePinsError } from 'common/trophies'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const setShowcasePins: APIHandler<'set-showcase-pins'> =
  onlyUsersWhoCanPerformAction(
    'setShowcasePins',
    async ({ userId, pins }, auth) => {
      assertOwnProfile(userId, auth)
      const pg = createSupabaseDirectClient()
      await pg.tx(async (tx) => {
        // Checked and saved under the user row lock unclaim-trophy also
        // takes, so an unclaim can't land between the check and the save.
        await tx.one(`select 1 from users where id = $1 for no key update`, [
          auth.uid,
        ])
        const claims = await getTrophyClaims(tx, auth.uid)
        const error = getShowcasePinsError(pins, claims)
        if (error) throw new APIError(400, error)

        await tx.none(
          `insert into user_showcase (user_id, pins, updated_at)
           values ($1, $2, now())
           on conflict (user_id)
           do update set pins = excluded.pins, updated_at = now()`,
          [auth.uid, pins]
        )
      })
      return { pins }
    }
  )
