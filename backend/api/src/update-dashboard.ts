import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'
import { DashboardItemSchema, contentSchema } from 'shared/zod-types'
import { z } from 'zod'
import { authEndpoint, validate } from './helpers'
import { isAdminId } from 'common/envs/constants'
import { updateDashboardGroups } from 'shared/supabase/dashboard'
import { MAX_DASHBOARD_TITLE_LENGTH } from 'common/dashboard'

const schema = z.object({
  title: z.string().min(1).max(MAX_DASHBOARD_TITLE_LENGTH),
  dashboardId: z.string(),
  description: contentSchema.optional(),
  items: z.array(DashboardItemSchema),
  topics: z.array(z.string()),
})

export const updatedashboard = authEndpoint(async (req, auth) => {
  const { title, dashboardId, description, items, topics } = validate(
    schema,
    req.body
  )

  log('updating dashboard')

  const isAdmin = isAdminId(auth.uid)

  const pg = createSupabaseDirectClient()

  const updatedDashboard = await pg.tx((txn) => {
    const dashboard = txn.one(
      `update dashboards
      set items = $1,
      title=$2,
      description=$3
      where id = $4 ${isAdmin ? '' : 'and creator_id = $5'}
      returning *`,
      [JSON.stringify(items), title, description, dashboardId, auth.uid]
    )

    updateDashboardGroups(dashboardId, topics, txn)

    return dashboard
  })

  // return updated dashboard
  return { updateDashboard: { ...updatedDashboard, topics } }
})
