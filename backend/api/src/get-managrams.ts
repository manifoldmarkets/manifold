import { millisToTs } from 'common/supabase/utils'
import { APIError, type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { convertTxn } from 'common/supabase/txns'
import { ManaPayTxn } from 'common/txn'
import { buildArray } from 'common/util/array'
import {
  from,
  limit,
  orderBy,
  renderSql,
  select,
  where,
} from 'shared/supabase/sql-builder'

export const getManagrams: APIHandler<'managrams'> = async (props) => {
  const { limit: limitValue, toId, fromId, before, after } = props

  const pg = createSupabaseDirectClient()

  const conditions = buildArray(
    where('category = ${category}', { category: 'MANA_PAYMENT' }),
    before && where('created_time < ${before}', { before: millisToTs(before) }),
    after && where('created_time > ${after}', { after: millisToTs(after) }),
    toId && where('to_id = ${toId}', { toId }),
    fromId && where('from_id = ${fromId}', { fromId })
  )

  const query = renderSql(
    select('*'),
    from('txns'),
    ...conditions,
    orderBy('created_time desc'),
    limitValue && limit(limitValue)
  )

  try {
    const data = await pg.manyOrNone(query)
    return (data.map(convertTxn) as ManaPayTxn[]) ?? []
  } catch (e) {
    throw new APIError(500, `Error while fetching managrams: ${e}`)
  }
}
