import { createSupabaseClient } from 'shared/supabase/init'
import { APIError, APIHandler } from './helpers'

export const getHeadlines: APIHandler<'headlines'> = async () => {
  const db = createSupabaseClient()

  const all = await db
    .from('dashboards')
    .select('id, slug, title')
    .gt('importance_score', 0)
    .order('importance_score', { ascending: false })

  if (all.error)
    throw new APIError(500, 'Error fetching headlines ' + all.error.message)

  return all.data
}
