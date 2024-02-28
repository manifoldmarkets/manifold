import { SupabaseClient, createSupabaseClient } from 'shared/supabase/init'
import { Column, Row, run, selectJson } from 'common/supabase/utils'
import { toLiteMarket } from 'common/api/market-types'
import { APIError, type APIHandler } from './helpers/endpoint'

const SORT_COLUMNS = {
  'created-time': 'created_time',
  'updated-time': 'last_updated_time',
  'last-bet-time': 'last_bet_time',
  'last-comment-time': 'last_comment_time',
} as const

// mqp: this pagination approach is technically incorrect if multiple contracts
// have the exact same createdTime, but that's very unlikely
const getBeforeValue = async <T extends Column<'public_contracts'>>(
  db: SupabaseClient,
  beforeId: string | undefined,
  sortColumn: T
) => {
  if (beforeId) {
    const { data } = await run(
      db.from('public_contracts').select(sortColumn).eq('id', beforeId)
    )
    if (!data?.length) {
      throw new APIError(
        400,
        'Contract specified in before parameter not found.'
      )
    }
    return (data[0] as any)[sortColumn] as Row<'public_contracts'>[T]
  } else {
    return undefined
  }
}

// Only fetches contracts with 'public' visibility
export const getMarkets: APIHandler<'markets'> = async ({
  limit,
  userId,
  groupId,
  before,
  sort,
  order,
}) => {
  const db = createSupabaseClient()
  const sortColumn = SORT_COLUMNS[sort ?? 'created-time']
  const q = selectJson(db, 'public_contracts')
  q.order(sortColumn, {
    ascending: order === 'asc',
    nullsFirst: false,
  } as any)
  if (before) {
    const beforeVal = await getBeforeValue(db, before, sortColumn)
    q.lt(sortColumn, beforeVal)
  }
  if (userId) {
    q.eq('creator_id', userId)
  }
  if (groupId) {
    // TODO: use the sql builder instead and use a join
    const { data, error } = await db
      .from('groups')
      .select('slug')
      .eq('id', groupId)
      .single()
    if (error) throw new APIError(404, `Group with id ${groupId} not found`)
    q.contains('group_slugs', [data.slug])
  }
  q.limit(limit)
  const { data } = await run(q)
  return data.map((r) => toLiteMarket(r.data))
}
