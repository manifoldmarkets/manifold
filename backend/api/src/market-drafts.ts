import { APIError } from 'common/api/utils'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIHandler } from './helpers/endpoint'
import { MarketDraft } from 'common/drafts'

export const saveMarketDraft: APIHandler<'save-market-draft'> = async (
  props,
  auth
) => {
  const pg = createSupabaseDirectClient()
  const { data } = props

  const result = await pg.one<{ id: number }>(
    `insert into market_drafts (user_id, data)
     values ($1, $2)
     returning id`,
    [auth.uid, data]
  )

  return { id: result.id }
}

export const getMarketDrafts: APIHandler<'get-market-drafts'> = async (
  _props,
  auth
) => {
  const pg = createSupabaseDirectClient()

  const drafts = await pg.manyOrNone<MarketDraft>(
    `select id, data, created_at as "createdAt"
     from market_drafts 
     where user_id = $1
     order by updated_at desc`,
    [auth.uid]
  )

  return drafts
}

export const deleteMarketDraft: APIHandler<'delete-market-draft'> = async (
  props,
  auth
) => {
  const pg = createSupabaseDirectClient()
  const { id } = props

  const result = await pg.result(
    `delete from market_drafts 
     where id = $1 and user_id = $2`,
    [id, auth.uid]
  )

  if (result.rowCount === 0) {
    throw new APIError(404, 'Draft not found or unauthorized')
  }

  return { success: true }
}
