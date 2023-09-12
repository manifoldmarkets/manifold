import { SupabaseClient } from '@supabase/supabase-js'
import { run } from './utils'
import { Dashboard } from 'common/dashboard'

export async function getDashboardFromSlug(slug: string, db: SupabaseClient) {
  const { data: dashboard } = await run(
    db.from('dashboards').select('*').eq('slug', slug).limit(1)
  )

  if (dashboard && dashboard.length > 0) {
    return dashboard[0]
  }
  return null
}


