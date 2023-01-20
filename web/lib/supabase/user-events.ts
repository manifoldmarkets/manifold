import { run, selectJson } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'

export async function getUserEvents(
  userId: string,
  eventName: string,
  afterTime?: number,
  beforeTime?: number
) {
  let q = selectJson(db, 'user_events')
    .eq('user_id', userId)
    .eq('data->>name', eventName)

  if (beforeTime) {
    q = q.lt('data->>timestamp', beforeTime)
  }
  if (afterTime) {
    q = q.gt('data->>timestamp', afterTime)
  }
  return (await run(q)).data.map((r) => r.data)
}
