import { SupabaseClient } from 'common/supabase/utils'

export async function getUserEventsCount(
  userId: string,
  eventNames: string[],
  startTime: number,
  endTime: number,
  db: SupabaseClient
) {
  let q = db
    .from('user_events')
    .select('*', { head: true, count: 'exact' })
    .eq('user_id', userId)
    .lt('data->>timestamp', endTime)
    .gt('data->>timestamp', startTime)
  if (eventNames.length === 1) {
    q = q.eq('data->>name', eventNames[0])
  } else {
    q = q.in('data->>name', eventNames)
  }

  const { count, error } = await q
  if (error != null) throw error

  return count ?? 0
}
