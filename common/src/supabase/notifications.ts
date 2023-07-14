import { Row, SupabaseClient } from 'common/supabase/utils'

export async function getNotifications(
  db: SupabaseClient,
  userId: string,
  limit: number
) {
  const { data } = await db
    .from('user_notifications')
    .select('*')
    .eq('user_id', userId)
    .order('data->createdTime', { ascending: false } as any)
    .limit(limit)
  return data?.map((d: Row<'user_notifications'>) => d) ?? []
}

export async function getUnseenNotifications(
  db: SupabaseClient,
  userId: string,
  limit: number
) {
  const { data } = await db
    .from('user_notifications')
    .select('*')
    .eq('user_id', userId)
    .eq('data->>isSeen', 'false')
    .order('data->createdTime', { ascending: false } as any)
    .limit(limit)

  return data?.map((d: Row<'user_notifications'>) => d) ?? []
}
