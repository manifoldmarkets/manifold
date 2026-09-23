import { APIError } from 'common/api/utils'
import { PerpContract } from 'common/contract'
import { getPerpQuote as toPerpQuote } from 'common/perps/quote'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIHandler } from './helpers/endpoint'

// The live price/pool slice of a perp market, served uncached so the trading
// UI has a fallback that is actually fresh when the websocket push is
// unavailable (socket dropped, page just loaded, push failed).
//
// Deliberately narrow: reading `market/:id` for this instead costs a full
// LiteMarket, and that path is edge-cached and load-balanced to the read
// replicas, which is what let a ~30s-old price drive a close.
export const getPerpQuote: APIHandler<'get-perp-quote'> = async (body) => {
  const { contractId } = body
  const pg = createSupabaseDirectClient()
  const row = await pg.oneOrNone<{ data: PerpContract }>(
    `select data from contracts where id = $1 and mechanism = 'perp'`,
    [contractId]
  )
  if (!row)
    throw new APIError(404, `No perp market found with id ${contractId}`)
  return toPerpQuote(row.data)
}
