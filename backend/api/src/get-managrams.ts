import { millisToTs, run } from 'common/supabase/utils'
import { APIError, type APIHandler } from './helpers/endpoint'
import { createSupabaseClient } from 'shared/supabase/init'
import { convertTxn } from 'common/supabase/txns'
import { ManaPayTxn } from 'common/txn'

export const getManagrams: APIHandler<'managrams'> = async (props) => {
  const { limit, toId, fromId, before, after } = props

  const db = createSupabaseClient()
  let query = db
    .from('txns')
    .select()
    .eq('category', 'MANA_PAYMENT')
    .order('created_time', { ascending: false } as any)
    .limit(limit)
  if (before) query = query.lt('created_time', millisToTs(before))
  if (after) query = query.gt('created_time', millisToTs(after))
  if (toId) query = query.eq('to_id', toId)
  if (fromId) query = query.eq('from_id', fromId)
  try {
    const { data } = await run(query)
    return (data.map(convertTxn) as ManaPayTxn[]) ?? []
  } catch (e) {
    throw new APIError(500, `Error while fetching managrams: ${e}`)
  }
}
