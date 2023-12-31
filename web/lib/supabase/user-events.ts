import { db } from 'web/lib/supabase/db'
import { run } from 'common/supabase/utils'

// NOTE: user must be authorized via useIsAuthorized() to use this query
export const getSeenContractIds = async (
  userId: string,
  contractIds: string[],
  since: number,
  type: ('view market card' | 'view market')[]
) => {
  const { data } = await run(
    db
      .from('user_seen_markets')
      .select('contract_id')
      .eq('user_id', userId)
      .in('type', type)
      .in('contract_id', contractIds)
      .gt('created_time', new Date(since).toISOString())
  )

  return data?.map((c) => c.contract_id) ?? []
}
