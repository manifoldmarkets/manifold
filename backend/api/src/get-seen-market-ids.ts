import { APIHandler } from 'api/helpers/endpoint'
import { createSupabaseClient } from 'shared/supabase/init'
import { run } from 'common/supabase/utils'

export const getSeenMarketIds: APIHandler<'get-seen-market-ids'> = async (
  body,
  auth
) => {
  const { contractIds, types, since } = body
  const db = createSupabaseClient()
  const { data } = await run(
    db
      .from('user_seen_markets')
      .select('contract_id')
      .eq('user_id', auth.uid)
      .in('type', types)
      .in('contract_id', contractIds)
      .gt('created_time', new Date(since).toISOString())
  )

  return data?.map((c) => c.contract_id) ?? []
}
