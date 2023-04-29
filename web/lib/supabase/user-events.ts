import { run } from 'common/supabase/utils'
import { Json } from 'common/supabase/schema'
import { db } from './db'

export async function saveUserEvent(
  userId: string | undefined,
  contractId: string | undefined,
  eventName: string,
  eventProperties?: Record<string, Json>
) {
  return await run(
    db.from('user_events').insert({
      user_id: userId,
      contract_id: contractId,
      name: eventName,
      data: eventProperties ?? {},
    })
  )
}
