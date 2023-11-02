import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getUserSupabase, log, revalidateStaticProps } from 'shared/utils'
import { DashboardItemSchema, contentSchema } from 'shared/zod-types'
import { z } from 'zod'
import { authEndpoint, validate } from './helpers'
import { isAdminId, isTrustworthy } from 'common/envs/constants'
import { updateDashboardGroups } from 'shared/supabase/dashboard'
import { MAX_DASHBOARD_TITLE_LENGTH } from 'common/dashboard'
import { track } from 'shared/analytics'

const schema = z
  .object({
    title: z.string().min(1).max(MAX_DASHBOARD_TITLE_LENGTH),
    dashboardId: z.string(),
    description: contentSchema.optional(),
    items: z.array(DashboardItemSchema),
    topics: z.array(z.string()),
  })
  .strict()

export const updatedashboard = authEndpoint(async (req, auth) => {
  const { title, dashboardId, description, items, topics } = validate(
    schema,
    req.body
  )

  log('updating dashboard')

  const user = await getUserSupabase(auth.uid)
  const isMod = isAdminId(auth.uid) || isTrustworthy(user?.username)

  const pg = createSupabaseDirectClient()

  const updatedDashboard = await pg.tx((txn) => {
    const dashboard = txn.one(
      `update dashboards
      set items = $1,
      title=$2,
      description=$3
      where id = $4 ${isMod ? '' : 'and creator_id = $5'}
      returning *`,
      [JSON.stringify(items), title, description, dashboardId, auth.uid]
    )

    updateDashboardGroups(dashboardId, topics, txn)

    return dashboard
  })

  track(auth.uid, 'update-dashboard', {
    dashboardId,
    title,
    items,
    topics,
    username: user?.username,
  })

  await revalidateStaticProps(`/dashboards/${updatedDashboard.slug}`)
  // if in news
  if (updatedDashboard.importance_score) {
    await Promise.all([
      revalidateStaticProps(`/news`),
      revalidateStaticProps(`/home`),
    ])
  }

  // return updated dashboard
  return { updateDashboard: { ...updatedDashboard, topics } }
})
