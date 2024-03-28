import { type SupabaseClient } from '@supabase/supabase-js'

export const getDashboardsToDisplayOnContract = async (
  slug: string,
  db: SupabaseClient
) => {
  const { data, error } = await db
    .from('dashboards')
    .select('title, slug')
    .contains('items', `[{ "type":"question", "slug":"${slug}" }]`)
    .order('importance_score', { ascending: false })
    .order('politics_importance_score', { ascending: false })
    .order('ai_importance_score', { ascending: false })
    .order('created_time')
    .limit(3)

  if (error) console.error(error.message)

  return data ?? []
}
