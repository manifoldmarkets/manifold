import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { z } from 'zod'
import { authEndpoint, validate } from './helpers'
import { run } from 'common/supabase/utils'

export const getyourdashboards = authEndpoint(async (req, auth) => {
  if (!auth.uid) {
    return { dashboards: [] }
  }
  const db = createSupabaseClient()
  const { data } = await run(
    db.from('dashboards').select('*').eq('creator_id', auth.uid)
  )

  console.log(data)
  if (data && data.length > 0) {
    return { dashboards: data }
  }
  return { dashboards: [] }
})
