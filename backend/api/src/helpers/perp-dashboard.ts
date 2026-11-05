import { PerpContract } from 'common/contract'
import { PerpDashboardMarket } from 'common/perps/management'
import { DAY_MS } from 'common/util/time'
import { getMinTradingMarkAgeMs, getOracleFeed } from 'shared/oracle-feeds'
import { SupabaseDirectClient } from 'shared/supabase/init'

export const summarizeAccount = (user: {
  id: string
  username: string
  balance: number
}) => ({ id: user.id, username: user.username, balance: user.balance })

// Book and 24h activity for each market, shared by the MNX and admin consoles.
export const getPerpDashboardMarkets = async (
  pg: SupabaseDirectClient,
  contracts: PerpContract[],
  asOf: number
): Promise<PerpDashboardMarket[]> => {
  const ids = contracts.map((c) => c.id)
  const [positions, activity] = await Promise.all([
    pg.manyOrNone<{
      contract_id: string
      traders: number
      long_oi: number
      short_oi: number
    }>(
      `select contract_id, count(distinct user_id)::int as traders,
              coalesce(sum(size) filter (where direction = 'long'), 0)::float8 as long_oi,
              coalesce(sum(size) filter (where direction = 'short'), 0)::float8 as short_oi
         from contract_perp_positions where contract_id = any($1) and size > 0
         group by contract_id`,
      [ids]
    ),
    pg.manyOrNone<{ contract_id: string; volume: number; fees: number }>(
      `select contract_id,
              coalesce(sum(abs(original_cost_basis_delta)), 0)::float8 as volume,
              coalesce(sum((data->>'fee')::float8), 0)::float8 as fees
         from contract_perp_events
        where contract_id = any($1) and applied_ts >= $2 and applied_ts <= $3
          and event_type in ('open', 'add', 'close')
        group by contract_id`,
      [ids, new Date(asOf - DAY_MS), new Date(asOf)]
    ),
  ])
  return contracts.map((contract) => {
    const book = positions.find((p) => p.contract_id === contract.id)
    const trades = activity.find((a) => a.contract_id === contract.id)
    const feed = getOracleFeed(contract.oracleFeedId)
    return {
      contract,
      activeTraders: book?.traders ?? 0,
      openInterestLong: book?.long_oi ?? 0,
      openInterestShort: book?.short_oi ?? 0,
      volume24Hours: trades?.volume ?? 0,
      fees24Hours: trades?.fees ?? 0,
      minOraclePriceAgeMs: feed
        ? getMinTradingMarkAgeMs(feed)
        : contract.maxOraclePriceAgeMs,
    }
  })
}
