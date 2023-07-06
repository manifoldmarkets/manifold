import { SupabaseClient } from 'common/supabase/utils'

export async function getNotifications(
  db: SupabaseClient,
  userId: string,
  limit: number
) {
  const { data } = await db.rpc(`get_notifications`, {
    uid: userId,
    unseen_only: false,
    max_num: limit,
  })
  return (
    data?.map((d: any) => {
      return d
    }) ?? []
  )
}

export async function getUnseenNotifications(
  db: SupabaseClient,
  userId: string,
  limit: number
) {
  const { data } = await db.rpc(`get_notifications`, {
    uid: userId,
    unseen_only: true,
    max_num: limit,
  })
  return (
    data?.map((d: any) => {
      return d
    }) ?? []
  )
}
