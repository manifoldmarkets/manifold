import { sortBy, uniq } from 'lodash'

import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { getOracleFeed, ORACLE_FEEDS } from 'shared/oracle-feeds'
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
  // Include the registry independently of stored history: a disabled feed must
  // remain blocked in the form even before its first point is written. Also
  // retain price-only ids so the form can explain why they cannot back a
  // market instead of silently hiding them.
  const feedIds = sortBy(
    uniq([
      ...ORACLE_FEEDS.map((feed) => feed.id),
      ...rows.map((r) => r.feed_id),
    ])
  )
  return feedIds.map((id) => {
    const feed = getOracleFeed(id)
    return {
      id,
      updatePeriodMs: feed?.updatePeriodMs ?? null,
      marketCreationEnabled: feed?.marketCreationEnabled ?? false,
    }
  })
}
