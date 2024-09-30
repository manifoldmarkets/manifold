import { convertDashboardSqltoTS } from 'common/dashboard'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { jsonEndpoint } from './helpers/endpoint'

export const getnews = jsonEndpoint(async () => {
  const pg = createSupabaseDirectClient()

  return await pg.map(
    `select d.*, array_agg(dg.group_id) as topics
    from dashboards d
    left join dashboard_groups dg on d.id = dg.dashboard_id
    where d.visibility != 'deleted'
      and d.importance_score > 0
    group by d.id
    order by d.importance_score desc`,
    undefined,
    ({ topics, ...rest }) => ({ ...convertDashboardSqltoTS(rest), topics })
  )
})
