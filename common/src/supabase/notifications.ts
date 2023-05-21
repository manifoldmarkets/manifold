import { SupabaseClient, run, selectJson } from 'common/supabase/utils'

export async function getNotifications(
  db: SupabaseClient,
  userId: string,
  limit: number
) {
  let q = db
    .from('user_notifications')
    .select('*')
    .eq('user_id', userId)
    .order('data->created_time', { ascending: false } as any)
    .limit(limit)
  const { data } = await run(q)
  return data
}

export async function getUnseenNotifications(
  db: SupabaseClient,
  userId: string,
  limit: number
) {
  let q = db
    .from('user_notifications')
    .select('*')
    .eq('user_id', userId)
    .eq('data->isSeen', false)
    .order('data->created_time', { ascending: false } as any)
    .limit(limit)
  const { data } = await run(q)
  return data
}
