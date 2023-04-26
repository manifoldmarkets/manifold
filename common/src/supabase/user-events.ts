import { SupabaseClient, run, millisToTs } from 'common/supabase/utils'
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
    .lt('ts', millisToTs(endTime))
    .gt('ts', millisToTs(startTime))
  if (eventNames.length === 1) {
    q = q.eq('name', eventNames[0])
  } else {
    q = q.in('name', eventNames)
  }

  const { count } = await run(q)
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
    .select('data->>url')
    .eq('user_id', userId)
    .gt('ts', millisToTs(startTime))
    .lt('ts', millisToTs(endTime))
    .eq('data->>type', 'copy sharing link')

  const { data } = await run(q)
  const shareEventUrls = data.map((r) => (r as any).url)
  return uniq(shareEventUrls).length
}
