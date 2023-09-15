import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'
import { z } from 'zod'
import { APIError, authEndpoint, validate } from './helpers'
import { DashboardItemSchema, contentSchema } from 'shared/zod-types'
import { slugify } from 'common/util/slugify'
import { randomString } from 'common/util/random'

const schema = z.object({
  dashboardId: z.string(),
  items: z.array(DashboardItemSchema),
})

export const updatedashboard = authEndpoint(async (req, auth) => {
  const { dashboardId, items } = validate(schema, req.body)

  log('creating dashboard')
  const pg = createSupabaseDirectClient()

  const updatedDashboard = await pg.one(
    `update dashboards
      items = $1
      where id = $2 and creator_id = $3
      returning *`,
    [JSON.stringify(items), dashboardId, auth.uid]
  )

  // return updated dashboard
  return { updateDashboard: updatedDashboard }
})
