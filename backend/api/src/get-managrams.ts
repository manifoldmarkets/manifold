import { run } from 'common/supabase/utils'
import { APIError, type APIHandler } from './helpers'
import { createSupabaseClient } from 'shared/supabase/init'
import type { ManaPayTxn } from 'common/txn'

export const getManagrams: APIHandler<'managrams'> = async (props, auth) => {
  const { limit, toId, fromId, before, after } = props

  const db = createSupabaseClient()
  let query = db
    .from('txns')
    .select('data')
    .eq('data->>category', 'MANA_PAYMENT')
    .order('data->createdTime', { ascending: false } as any)
    .limit(limit)
  if (before) query = query.lt('data->createdTime', before)
  if (after) query = query.gt('data->createdTime', after)
  if (toId) query = query.eq('data->>toId', toId)
  if (fromId) query = query.eq('data->>fromId', fromId)
  try {
    const { data } = await run(query)
    return data.map((txn) => txn.data as ManaPayTxn) ?? []
  } catch (e) {
    throw new APIError(500, `Error while fetching managrams: ${e}`)
  }
}
