import { PerpContract } from 'common/contract'
import { ENV } from 'common/envs/constants'
import { MNX_INSTRUMENTS } from 'common/perps/mnx'
import { convertContract } from 'common/supabase/contracts'
import { convertUser } from 'common/supabase/users'
import { DAY_MS } from 'common/util/time'
import { getMinTradingMarkAgeMs, getOracleFeed } from 'shared/oracle-feeds'
import { getMnxCreatorId } from 'shared/perps/creator-accounts'
import { requirePerpManager } from 'shared/perps/management-auth'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIHandler } from './helpers/endpoint'

export const getMnxDashboard: APIHandler<'get-mnx-dashboard'> = async (
  _,
  auth
) => {
  const pg = createSupabaseDirectClient()
  const payer = await requirePerpManager(pg, auth.uid)
  const ownerId = getMnxCreatorId(ENV)
  const account = ownerId
    ? await pg.oneOrNone(
        'select * from users where id = $1',
        [ownerId],
        convertUser
      )
    : null
  const asOf = Date.now()
  const rows = await pg.manyOrNone(
    `select * from contracts
      where mechanism = 'perp' and creator_id = $1
        and data->>'oracleFeedId' = any($2)
      order by created_time`,
    [ownerId ?? null, MNX_INSTRUMENTS.map((i) => i.feedId)]
  )
  const contracts = rows.map(convertContract) as PerpContract[]
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
  const summary = (user: typeof payer) => ({
    id: user.id,
    username: user.username,
    balance: user.balance,
  })
  return {
    asOf,
    account: account ? summary(account) : null,
    payer: summary(payer),
    markets: contracts.map((contract) => {
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
    }),
  }
}
