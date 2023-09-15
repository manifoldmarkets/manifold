import { run } from 'common/supabase/utils'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { authEndpoint } from './helpers'

export const getyourfolloweddashboards = authEndpoint(async (req, auth) => {
  if (!auth.uid) {
    return { dashboards: [] }
  }
  const pg = createSupabaseDirectClient()
  const data = await pg.manyOrNone(
    'SELECT dashboards.* from dashboards join dashboard_follows on dashboard_follows.dashboard_id = dashboards.id where dashboard_follows.follower_id = $1',
    [auth.uid]
  )

  if (data && data.length > 0) {
    return { dashboards: data }
  }
  return { dashboards: [] }
})
