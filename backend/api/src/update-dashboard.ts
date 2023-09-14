import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'
import { z } from 'zod'
import { APIError, authEndpoint, validate } from './helpers'
import { DashboardItemSchema, contentSchema } from 'shared/zod-types'
import { slugify } from 'common/util/slugify'
import { randomString } from 'common/util/random'

const schema = z.object({
  dashboardId: z.string(),
  title: z.string(),
  description: contentSchema.optional(),
  items: z.array(DashboardItemSchema),
})

export const updatedashboard = authEndpoint(async (req, auth) => {
  const { dashboardId, title, description, items } = validate(schema, req.body)

  log('creating dashboard')
  const pg = createSupabaseDirectClient()

  // create if not exists the group invite link row
  const updatedDashboard  = await pg.one(
    `update dashboards
      set title = $1,
      description = $2,
      items = $3
      where id = $4 and creator_id = $5
      returning *`,
    [title, description, JSON.stringify(items), dashboardId, auth.uid]
  )

  console.log(updatedDashboard)
  // return something
  return { updateDashboard: updatedDashboard }
})
