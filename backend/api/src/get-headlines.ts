import { createSupabaseClient } from 'shared/supabase/init'
import { APIError, APIHandler } from './helpers'
import { uniqBy } from 'lodash'

export const getHeadlines: APIHandler<'headlines'> = async (props, auth) => {
  const db = createSupabaseClient()

  const all = await db
    .from('dashboards')
    .select('id, slug, title')
    .gt('importance_score', 0)
    .order('importance_score', { ascending: false })

  if (all.error)
    throw new APIError(500, 'Error fetching headlines' + all.error.message)

  if (!auth) {
    return all.data
  } else {
    const mine = await db
      .from('dashboards')
      .select('id, slug, title')
      .eq('dashboard_follows (follower_id)', auth.uid)
      .order('importance_score', { ascending: false })

    if (mine.error)
      throw new APIError(500, 'Error fetching headlines' + mine.error.message)

    return uniqBy([...mine.data, ...all.data], 'id')
  }
}
