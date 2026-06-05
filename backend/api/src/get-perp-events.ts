import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIHandler } from './helpers/endpoint'

// Fetches the event log for a perp contract with user info joined, paginated
// by id (DESC). Excludes pool-level 'funding' events (they're surfaced via
// the dedicated funding chart; here they'd spam the trades feed and have no
// user to attribute them to). Used by the Trades tab on perp contract pages.
export const getPerpEvents: APIHandler<'get-perp-events'> = async (body) => {
  const { contractId, userId, beforeId, limit = 50 } = body
  const pg = createSupabaseDirectClient()

  const rows = await pg.manyOrNone<{
    id: number
    ts: string
    user_id: string | null
    direction: string | null
    event_type: string
    oracle_price: number | string | null
    size_delta: number | string
    cost_basis_delta: number | string
    original_cost_basis_delta: number | string
    leverage: number | string | null
    data: Record<string, any> | null
    user_name: string | null
    username: string | null
    avatar_url: string | null
  }>(
    `select e.id, e.ts, e.user_id, e.direction, e.event_type,
            e.oracle_price, e.size_delta, e.cost_basis_delta,
            e.original_cost_basis_delta, e.leverage, e.data,
            u.name as user_name, u.username, u.data->>'avatarUrl' as avatar_url
       from contract_perp_events e
       left join users u on u.id = e.user_id
      where e.contract_id = $1
        and e.event_type <> 'funding'
        and ($2::text is null or e.user_id = $2::text)
        and ($3::bigint is null or e.id < $3::bigint)
      order by e.id desc
      limit $4`,
    [contractId, userId ?? null, beforeId ?? null, limit]
  )

  return rows.map((r) => {
    const data = r.data ?? {}
    const payoutRaw = (data as any).payout
    const pnlRaw = (data as any).pnl
    return {
      id: Number(r.id),
      ts: new Date(r.ts).getTime(),
      userId: r.user_id,
      direction: r.direction as 'long' | 'short' | null,
      eventType: r.event_type as
        | 'open'
        | 'add'
        | 'close'
        | 'liquidation'
        | 'adl'
        | 'funding',
      oraclePrice: Number(r.oracle_price ?? 0),
      sizeDelta: Number(r.size_delta),
      costBasisDelta: Number(r.cost_basis_delta),
      originalCostBasisDelta: Number(r.original_cost_basis_delta),
      leverage: r.leverage != null ? Number(r.leverage) : null,
      payout: payoutRaw != null ? Number(payoutRaw) : null,
      pnl: pnlRaw != null ? Number(pnlRaw) : null,
      userName: r.user_name,
      username: r.username,
      avatarUrl: r.avatar_url,
    }
  })
}
