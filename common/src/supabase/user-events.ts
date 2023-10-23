import { SupabaseClient, run, millisToTs } from 'common/supabase/utils'
import { uniq } from 'lodash'

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
