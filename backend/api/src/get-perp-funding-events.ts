import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIHandler } from './helpers/endpoint'

export const getPerpFundingEvents: APIHandler<
  'get-perp-funding-events'
> = async (body) => {
  const { contractId, since, limit = 5000 } = body
  const pg = createSupabaseDirectClient()
  const rows = await pg.manyOrNone<{
    ts: string
    funding_rate: number | string
    oracle_price: number | string
    num_liquidations: number
    adl_factor_long: number | string
    adl_factor_short: number | string
  }>(
    `select ts, funding_rate, oracle_price, num_liquidations,
            adl_factor_long, adl_factor_short
       from contract_perp_funding_events
      where contract_id = $1
        and ($2::bigint is null or extract(epoch from ts) * 1000 >= $2::bigint)
      order by ts asc
      limit $3`,
    [contractId, since ?? null, limit]
  )
  return rows.map((r) => ({
    ts: new Date(r.ts).getTime(),
    fundingRate: Number(r.funding_rate),
    oraclePrice: Number(r.oracle_price),
    numLiquidations: Number(r.num_liquidations ?? 0),
    adlFactorLong: Number(r.adl_factor_long ?? 1),
    adlFactorShort: Number(r.adl_factor_short ?? 1),
  }))
}
