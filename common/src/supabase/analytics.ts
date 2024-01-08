import { run, SupabaseClient } from 'common/supabase/utils'
import { removeUndefinedProps } from 'common/util/object'
import { Json } from 'common/supabase/schema'
export type EventData = Record<string, Json | undefined>

export async function insertUserEvent(
  name: string,
  data: EventData,
  db: SupabaseClient,
  userId?: string | null,
  contractId?: string | null,
  commentId?: string | null,
  adId?: string | null
) {
  if (
    (name === 'view market' || name === 'view market card') &&
    userId &&
    contractId
  ) {
    return run(
      db.from('user_seen_markets').insert({
        user_id: userId,
        contract_id: contractId,
        is_promoted: data?.isPromoted as boolean,
        type: name,
      })
    )
  }
  return run(
    db.from('user_events').insert({
      name,
      data: removeUndefinedProps(data) as Record<string, Json>,
      user_id: userId,
      contract_id: contractId,
      comment_id: commentId,
      ad_id: adId,
    })
  )
}
