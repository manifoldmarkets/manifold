import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'
import { DashboardItemSchema, contentSchema } from 'shared/zod-types'
import { z } from 'zod'
import { authEndpoint, validate } from './helpers'

const schema = z.object({
  dashboardId: z.string(),
  description: contentSchema.optional(),
  items: z.array(DashboardItemSchema),
})

export const updatedashboard = authEndpoint(async (req, auth) => {
  const { dashboardId, description, items } = validate(schema, req.body)

  log('creating dashboard')
  const pg = createSupabaseDirectClient()

  const updatedDashboard = await pg.one(
    `update dashboards
      set items = $1,
      description=$2
      where id = $3 and creator_id = $4
      returning *`,
    [JSON.stringify(items), description, dashboardId, auth.uid]
  )

  // return updated dashboard
  return { updateDashboard: updatedDashboard }
})
