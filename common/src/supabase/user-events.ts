import { SupabaseClient } from 'common/supabase/utils'
import { ShareEvent } from 'common/events'
import { uniq } from 'lodash'

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

export async function getUniqueUserShareEventsCount(
  userId: string,
  startTime: number,
  endTime: number,
  db: SupabaseClient
) {
  const q = db
    .from('user_events')
    .select('data')
    .eq('user_id', userId)
    .gt('data->>timestamp', startTime)
    .lt('data->>timestamp', endTime)
    .eq('data->>type', 'copy sharing link')

  const { data, error } = await q
  if (error != null) throw error
  const shareEvents = data.map((e) => e.data as ShareEvent) ?? []
  const uniqueUrlsShared = uniq(shareEvents.map((e) => e.url))
  return uniqueUrlsShared.length
}
