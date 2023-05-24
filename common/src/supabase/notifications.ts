import { SupabaseClient, run } from 'common/supabase/utils'

export async function getNotifications(
  db: SupabaseClient,
  userId: string,
  limit: number
) {
  const q = db
    .from('user_notifications')
    .select('*')
    .eq('user_id', userId)
    .order('data->createdTime', { ascending: false } as any)
    .limit(limit)
  const { data } = await run(q)
  return data
}

export async function getUnseenNotifications(
  db: SupabaseClient,
  userId: string,
  limit: number
) {
  const q = db
    .from('user_notifications')
    .select('*')
    .eq('user_id', userId)
    .eq('data->isSeen', false)
    .order('data->createdTime', { ascending: false } as any)
    .limit(limit)
  const { data } = await run(q)
  return data
}
