import { APIHandler } from 'api/helpers/endpoint'
import { convertTxn } from 'common/supabase/txns'
import { millisToTs } from 'common/supabase/utils'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import {
  from,
  limit,
  orderBy,
  renderSql,
  select,
  where,
} from 'shared/supabase/sql-builder'

export const getTxns: APIHandler<'txns'> = async (props) => {
  return await getTxnsMain(props)
}

export const getTxnsMain = async (props: {
  token?: string
  offset: number
  limit: number
  before?: number
  after?: number
  toId?: string
  fromId?: string
  category?: string
  ignoreCategories?: string[]
}) => {
  const {
    token,
    offset,
    limit: limitValue,
    before,
    after,
    toId,
    fromId,
    category,
    ignoreCategories,
  } = props

  const pg = createSupabaseDirectClient()

  const query = renderSql(
    select('*'),
    from('txns'),

    token && where('token = ${token}', { token }),
    before && where('created_time < ${before}', { before: millisToTs(before) }),
    after && where('created_time > ${after}', { after: millisToTs(after) }),
    toId && where('to_id = ${toId}', { toId }),
    fromId && where('from_id = ${fromId}', { fromId }),
    category && where('category = ${category}', { category }),
    ignoreCategories && where('category not in ($1:list)', [ignoreCategories]),
    orderBy('created_time desc'),
    limit(limitValue, offset)
  )

  return await pg.map(query, [], convertTxn)
}
