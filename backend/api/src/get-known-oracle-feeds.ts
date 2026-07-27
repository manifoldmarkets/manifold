import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { getOracleFeed } from 'shared/oracle-feeds'
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
  // A feed can have price rows without a registry entry (create-perp rejects
  // those); surface null so the admin page can warn instead of guessing.
  return rows.map((r) => ({
    id: r.feed_id,
    updatePeriodMs: getOracleFeed(r.feed_id)?.updatePeriodMs ?? null,
  }))
}
