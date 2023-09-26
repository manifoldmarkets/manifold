import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'
import { DashboardItemSchema, contentSchema } from 'shared/zod-types'
import { z } from 'zod'
import { authEndpoint, validate } from './helpers'
import { isAdminId } from 'common/envs/constants'

const schema = z.object({
  title: z.string(),
  dashboardId: z.string(),
  description: contentSchema.optional(),
  items: z.array(DashboardItemSchema),
})

export const updatedashboard = authEndpoint(async (req, auth) => {
  const { title, dashboardId, description, items } = validate(schema, req.body)

  log('updating dashboard')

  const isAdmin = isAdminId(auth.uid)

  const pg = createSupabaseDirectClient()

  const updatedDashboard = await pg.one(
    `update dashboards
      set items = $1,
      title=$2,
      description=$3
      where id = $4 ${isAdmin ? '' : 'and creator_id = $5'}
      returning *`,
    [JSON.stringify(items), title, description, dashboardId, auth.uid]
  )

  // return updated dashboard
  return { updateDashboard: updatedDashboard }
})
