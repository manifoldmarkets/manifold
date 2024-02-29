import { APIError, APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'

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
  await pg.none(
    `insert into user_contract_views as ucv (user_id, contract_id, promoted_views, card_views, page_views)
     values ($1, $2, $3, $4, $5)
     on conflict (user_id, contract_id) do update set
       last_view_ts = now(),
       promoted_views = ucv.promoted_views + excluded.promoted_views,
       card_views = ucv.card_views + excluded.card_views,
       page_views = ucv.page_views + excluded.page_views
     where ucv.last_view_ts < now() - interval '1 minute'`,
    [
      userId ?? null,
      contractId,
      kind === 'promoted' ? 1 : 0,
      kind === 'page' ? 1 : 0,
      kind === 'card' ? 1 : 0,
    ]
  )

  return { status: 'success' }
}
