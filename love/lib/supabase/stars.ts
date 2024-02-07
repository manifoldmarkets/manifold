import { run } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'

export const getStars = async (creatorId: string) => {
  const { data } = await run(
    db
      .from('love_stars')
      .select('*')
      .filter('creator_id', 'eq', creatorId)
      .order('created_time', { ascending: false })
  )

  if (!data) return []

  return data.map((d) => d.target_id as string)
}
