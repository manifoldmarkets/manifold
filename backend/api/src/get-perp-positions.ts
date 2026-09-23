import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIError, APIHandler } from './helpers/endpoint'

// Joins to the `users` table so the holders tab can render avatars + names
// without a follow-up round-trip. Positions with a missing user (shouldn't
// happen — FK would normally prevent it) fall through as nulls.
//
// Three shapes, one query: a market's whole book (contractId), one user in
// one market (both), or a user's book across every perp (userId alone —
// the /perps hub polls that as a single request rather than one per
// market). The schema refuses a call with neither.
export const getPerpPositions: APIHandler<'get-perp-positions'> = async (
  body
) => {
  const { contractId, userId } = body
  if (!contractId && !userId) {
    throw new APIError(400, 'contractId or userId is required')
  }
  const pg = createSupabaseDirectClient()
  const rows = await pg.manyOrNone<{
    contract_id: string
    user_id: string
    direction: string
    size: number | string
    cost_basis: number | string
    original_cost_basis: number | string
    taker_fee_cost_basis: number | string
    entry_price: number | string
    leverage: number | string
    liquidation_price: number | string
    opened_time: string
    updated_time: string
    user_name: string | null
    username: string | null
    avatar_url: string | null
  }>(
    `select p.contract_id, p.user_id, p.direction, p.size, p.cost_basis,
            p.original_cost_basis, p.taker_fee_cost_basis,
            p.entry_price, p.leverage,
            p.liquidation_price, p.opened_time, p.updated_time,
            u.name as user_name, u.username, u.data->>'avatarUrl' as avatar_url
       from contract_perp_positions p
       left join users u on u.id = p.user_id
      where ($1::text is null or p.contract_id = $1::text)
        and ($2::text is null or p.user_id = $2::text)
      order by p.opened_time desc`,
    [contractId ?? null, userId ?? null]
  )
  return rows.map((r) => ({
    contractId: r.contract_id,
    userId: r.user_id,
    direction: r.direction as 'long' | 'short',
    size: Number(r.size),
    costBasis: Number(r.cost_basis),
    originalCostBasis: Number(r.original_cost_basis),
    takerFeeCostBasis: Number(r.taker_fee_cost_basis),
    entryPrice: Number(r.entry_price),
    leverage: Number(r.leverage),
    liquidationPrice: Number(r.liquidation_price),
    openedTime: new Date(r.opened_time).getTime(),
    updatedTime: new Date(r.updated_time).getTime(),
    userName: r.user_name,
    username: r.username,
    avatarUrl: r.avatar_url,
  }))
}
