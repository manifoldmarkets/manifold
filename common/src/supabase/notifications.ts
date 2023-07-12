import { Row, SupabaseClient } from 'common/supabase/utils'
import { filterDefined } from 'common/util/array'
import { Notification } from 'common/notification'

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
    .order('data->createdTime', { ascending: false } as any)
    .limit(limit)

  return filterDefined(
    data?.map((d: Row<'user_notifications'>) =>
      (d.data as Notification)?.isSeen ? null : d
    ) ?? []
  )
}
