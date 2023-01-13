import { run } from 'common/lib/supabase/utils'
import { db } from 'web/lib/supabase/db'
import { UserEvent } from 'common/events'

export async function getUserEvents(
  userId: string,
  eventName: string,
  afterTime?: number,
  beforeTime?: number
) {
  let q = db
    .from('user_events')
    .select('data')
    .eq('user_id', userId)
    .eq('data->>name', eventName)

  if (beforeTime) {
    q = q.lt('data->>timestamp', beforeTime)
  }
  if (afterTime) {
    q = q.gt('data->>timestamp', afterTime)
  }
  const { data } = await run(q)
  return data as UserEvent[]
}
