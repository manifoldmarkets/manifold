import { createSupabaseDirectClient } from 'shared/supabase/init'
import { revalidateCachedTag, revalidateStaticProps } from 'shared/utils'
import { DashboardItemSchema } from 'common/api/zod-types'
import { z } from 'zod'
import { authEndpoint, validate } from './helpers/endpoint'
import { ENV_CONFIG, isAdminId, isModId } from 'common/envs/constants'
import { updateDashboardGroups } from 'shared/supabase/dashboard'
import { MAX_DASHBOARD_TITLE_LENGTH } from 'common/dashboard'
import { track } from 'shared/analytics'

const schema = z
  .object({
    title: z.string().min(1).max(MAX_DASHBOARD_TITLE_LENGTH),
    dashboardId: z.string(),
    items: z.array(DashboardItemSchema),
    topics: z.array(z.string()),
  })
  .strict()

export const updatedashboard = authEndpoint(async (req, auth, log) => {
  const { title, dashboardId, items, topics } = validate(schema, req.body)

  log('updating dashboard')

  const isMod = isAdminId(auth.uid) || isModId(auth.uid)

  const pg = createSupabaseDirectClient()

  const updatedDashboard = await pg.tx((txn) => {
    const dashboard = txn.one(
      `update dashboards
      set items = $1,
      title = $2
      where id = $3
      ${isMod ? '' : 'and creator_id = $4'}
      returning *`,
      [JSON.stringify(items), title, dashboardId, auth.uid]
    )

    updateDashboardGroups(dashboardId, topics, txn)

    return dashboard
  })

  track(auth.uid, 'update-dashboard', {
    dashboardId,
    title,
    items,
    topics,
  })

  await revalidateStaticProps(`/news/${updatedDashboard.slug}`)
  await revalidateCachedTag(updatedDashboard.slug, ENV_CONFIG.politicsDomain)

  // return updated dashboard
  return { updateDashboard: { ...updatedDashboard, topics } }
})
