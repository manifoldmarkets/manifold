import { createSupabaseClient } from 'shared/supabase/init'
import { z } from 'zod'
import {
  APIError,
  type APIHandler,
  MaybeAuthedEndpoint,
  validate,
} from './helpers/endpoint'
import { run } from 'common/supabase/utils'
import { convertDashboardSqltoTS } from 'common/dashboard'

const bodySchema = z
  .object({
    dashboardSlug: z.string(),
  })
  .strict()
export const getDashboardFromSlug: APIHandler<
  'get-dashboard-from-slug'
> = async (props) => {
  return await getDashboardFromSlugInternal(props.dashboardSlug)
}
export const getdashboardfromslug = MaybeAuthedEndpoint(async (req) => {
  const { dashboardSlug } = validate(bodySchema, req.body)
  return await getDashboardFromSlugInternal(dashboardSlug)
})

const getDashboardFromSlugInternal = async (dashboardSlug: string) => {
  const db = createSupabaseClient()
  const dash = await db
    .from('dashboards')
    .select('*')
    .eq('slug', dashboardSlug)
    .single()

  if (dash.error)
    throw new APIError(404, 'Dashboard not found' + dash.error.message)

  const groups = await run(
    db
      .from('dashboard_groups')
      .select('group_id')
      .eq('dashboard_id', dash.data.id)
  )

  return {
    ...convertDashboardSqltoTS(dash.data),
    topics: groups.data.map((d) => d.group_id),
  }
}
