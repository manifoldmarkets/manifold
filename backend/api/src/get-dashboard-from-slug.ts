import { createSupabaseClient } from 'shared/supabase/init'
import { z } from 'zod'
import { MaybeAuthedEndpoint, validate } from './helpers'
import { run } from 'common/supabase/utils'
import { convertDashboardSqltoTS } from 'common/dashboard'

const bodySchema = z.object({
  dashboardSlug: z.string(),
})

export const getdashboardfromslug = MaybeAuthedEndpoint(async (req) => {
  const { dashboardSlug } = validate(bodySchema, req.body)
  const db = createSupabaseClient()
  const { data } = await run(
    db.from('dashboards').select('*').eq('slug', dashboardSlug).single()
  )

  return { dashboard: convertDashboardSqltoTS(data) }
})
