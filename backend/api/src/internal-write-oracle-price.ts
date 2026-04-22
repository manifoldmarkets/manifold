import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIHandler } from './helpers/endpoint'

// Write a single oracle price point. Intended for internal services; gated
// to admin auth for now. Idempotent on (feed_id, ts).
export const internalWriteOraclePrice: APIHandler<
  'internal-write-oracle-price'
> = async (body, auth) => {
  throwErrorIfNotAdmin(auth.uid)
  const { feedId, ts, price } = body
  const pg = createSupabaseDirectClient()
  await pg.none(
    `insert into oracle_prices (feed_id, ts, price)
     values ($1, to_timestamp($2::double precision / 1000.0), $3)
     on conflict (feed_id, ts) do update set price = excluded.price`,
    [feedId, ts, price]
  )
  return { success: true } as const
}
