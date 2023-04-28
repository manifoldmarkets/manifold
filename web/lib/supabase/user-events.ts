import { run, millisToTs } from 'common/supabase/utils'
import { Json } from 'common/supabase/schema'
import { db } from './db'
import { getId } from 'web/lib/firebase/utils'

export async function saveUserEvent(
  userId: string | undefined,
  contractId: string | undefined,
  eventName: string,
  eventProperties?: Record<string, Json>
) {
  return await run(
    db.from('user_events').insert({
      user_id: userId ?? 'NO_USER',
      contract_id: contractId,
      event_id: getId(),
      ts: millisToTs(Date.now()),
      name: eventName,
      data: eventProperties ?? {},
    })
  )
}
