import { isAdminId } from 'common/envs/constants'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { z } from 'zod'
import { APIError, authEndpoint, validate } from './helpers'

const schema = z
  .object({
    dashboardIds: z.array(z.string()),
  })
  .strict()

export const setnews = authEndpoint(async (req, auth) => {
  const { dashboardIds } = validate(schema, req.body)
  if (!isAdminId(auth.uid)) {
    throw new APIError(403, 'You are not an admin')
  }

  const pg = createSupabaseDirectClient()
  // update all dashboards to be important

  await pg.tx(async (t) => {
    await t.none(`update dashboards set importance_score = 0`)

    if (!dashboardIds.length) {
      return
    }

    const queries = dashboardIds.map((id, i) =>
      t.none(`update dashboards set importance_score = $2 where id = $1`, [
        id,
        1 - i / dashboardIds.length,
      ])
    )

    return t.batch(queries)
  })

  return { success: true }
})
