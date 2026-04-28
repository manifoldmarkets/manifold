import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIHandler } from './helpers/endpoint'

export const getKnownOracleFeeds: APIHandler<'get-known-oracle-feeds'> = async (
  _body,
  auth
) => {
  throwErrorIfNotAdmin(auth.uid)
  const pg = createSupabaseDirectClient()
  const rows = await pg.manyOrNone<{ feed_id: string }>(
    `select distinct feed_id from oracle_prices order by feed_id asc`
  )
  return rows.map((r) => r.feed_id)
}
