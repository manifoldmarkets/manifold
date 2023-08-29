import { SupabaseClient, run } from 'common/supabase/utils'

export async function getUserManalinks(userId: string, db: SupabaseClient) {
  const { data } = await run(
    db.from('manalinks').select('data').eq('from_id', userId)
  )

  if (data && data.length > 0) {
    return data.map((d) => (d as any).data)
  }
  return []
}
