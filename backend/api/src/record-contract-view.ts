import { APIError, APIHandler } from 'api/helpers/endpoint'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { log } from 'shared/utils'

type ViewKind = 'card' | 'promoted' | 'page'

const VIEW_COLUMNS = {
  card: ['last_card_view_ts', 'card_views'],
  promoted: ['last_promoted_view_ts', 'promoted_views'],
  page: ['last_page_view_ts', 'page_views'],
} as const

async function insertUserContractView(
  pg: SupabaseDirectClient,
  kind: ViewKind,
  contractId: string,
  userId?: string
) {
  // when we see an existing row, we need to bump the count by 1 and flip the timestamp to now
  const [ts_column, count_column] = VIEW_COLUMNS[kind]
  return await pg.none(
    `insert into user_contract_views as ucv (user_id, contract_id, $3:name, $4:name)
       values ($1, $2, now(), 1)
       on conflict (user_id, contract_id) do update set
         $3:name = excluded.$3:name, $4:name = ucv.$4:name + excluded.$4:name
       where ucv.$3:name is null or ucv.$3:name < now() - interval '1 minute'`,
    [userId ?? null, contractId, ts_column, count_column]
  )
}

export const recordContractView: APIHandler<'record-contract-view'> = async (
  body,
  auth
) => {
  const { userId, contractId, kind } = body
  if (userId !== auth?.uid) {
    throw new APIError(401, 'Can only insert views for own user ID.')
  }
  const pg = createSupabaseDirectClient()
  if (userId != null) {
    log('Inserting USM entry for view.', { userId, contractId, kind })
    await pg.none(
      `insert into user_seen_markets (user_id, contract_id, is_promoted, type)
       values ($1, $2, $3, $4)`,
      [
        userId,
        contractId,
        kind === 'promoted',
        kind === 'page' ? 'view market' : 'view market card',
      ]
    )
  }
  log('Inserting UCV entry for view.', { userId, contractId, kind })
  await insertUserContractView(pg, kind, contractId, userId)

  return { status: 'success' }
}
