import { createSupabaseDirectClient } from 'shared/supabase/init'
import { authEndpoint } from './helpers/endpoint'
import { convertDashboardSqltoTS } from 'common/dashboard'

export const getyourdashboards = authEndpoint(async (_, auth) => {
  if (!auth.uid) {
    return { dashboards: [] }
  }

  const pg = createSupabaseDirectClient()
  const dashboards = await pg.map(
    `select * from dashboards where creator_id = $1`,
    auth.uid,
    convertDashboardSqltoTS
  )

  return { dashboards }
})
