import { run } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'
import { api } from 'web/lib/api/api'
import { getContractIdsWithMetrics } from 'common/supabase/contract-metrics'
import { getDisplayUsers } from 'web/lib/supabase/users'
import {
  BatchQueryParams,
  QueryHandlers,
} from 'client-common/hooks/use-batched-getter'

export const queryHandlers: QueryHandlers = {
  markets: async ({ ids }: BatchQueryParams) => {
    return await api('markets-by-ids', { ids: Array.from(ids) })
  },
  'comment-reactions': async ({ ids }: BatchQueryParams) => {
    const { data: reactionsData } = await run(
      db
        .from('user_reactions')
        .select()
        .eq('content_type', 'comment')
        .in('content_id', Array.from(ids))
    )
    return reactionsData
  },
  'contract-reactions': async ({ ids }: BatchQueryParams) => {
    const { data: reactionsData } = await run(
      db
        .from('user_reactions')
        .select()
        .eq('content_type', 'contract')
        .in('content_id', Array.from(ids))
    )
    return reactionsData
  },
  'contract-metrics': async ({ ids, userId }: BatchQueryParams) => {
    if (!userId) return []
    return await getContractIdsWithMetrics(db, userId, Array.from(ids))
  },
  user: async ({ ids }: BatchQueryParams) => {
    return await getDisplayUsers(Array.from(ids))
  },
  users: async ({ ids }: BatchQueryParams) => {
    const userIds = Array.from(ids).flatMap((id) => id.split(','))
    return await getDisplayUsers(userIds)
  },
}
