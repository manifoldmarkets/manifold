import { z } from 'zod'
import { isAdminId, isModId } from 'common/envs/constants'
import { APIError, authEndpoint, validate } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { track } from 'shared/analytics'

const schema = z
  .object({
    dashboardId: z.string(),
  })
  .strict()

export const deletedashboard = authEndpoint(async (req, auth) => {
  const { dashboardId } = validate(schema, req.body)

  if (!isAdminId(auth.uid) && !isModId(auth.uid)) {
    throw new APIError(403, 'You are not an admin or mod')
  }

  const pg = createSupabaseDirectClient()

  await pg.none(
    `update dashboards
    set visibility = deleted, importance_score = 0
    where id = $1`,
    dashboardId
  )

  track(auth.uid, 'delete-dashboard', { dashboardId })

  return { status: 'success' }
})
