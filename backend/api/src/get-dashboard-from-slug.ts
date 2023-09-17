import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { z } from 'zod'
import { MaybeAuthedEndpoint, authEndpoint, validate } from './helpers'
import { run } from 'common/supabase/utils'

const bodySchema = z.object({
  dashboardSlug: z.string(),
})

export const getdashboardfromslug = MaybeAuthedEndpoint(async (req) => {
  const { dashboardSlug } = validate(bodySchema, req.body)
  const db = createSupabaseClient()
  const { data } = await run(
    db.from('dashboards').select('*').eq('slug', dashboardSlug).limit(1)
  )

  if (data && data.length > 0) {
    return { dashboard: data[0] }
  }
  return { dashboard: null }
})
