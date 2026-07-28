import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIHandler } from './helpers/endpoint'

// Fetches the event log for a perp contract with user info joined, paginated
// by id (DESC). Excludes pool-level funding and aggregate ADL audit events:
// neither is a user trade, and showing their null user as "anon" spams and
// misrepresents the public Trades tab. Funding is surfaced by its chart, while
// each affected ADL position already has its own user-attributed event.
// Used by the Trades tab and user position history.
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
    data: Record<string, unknown> | null
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
        and e.user_id is not null
        and ($2::text is null or e.user_id = $2::text)
        and ($3::bigint is null or e.id < $3::bigint)
      order by e.id desc
      limit $4`,
    [contractId, userId ?? null, beforeId ?? null, limit]
  )

  return rows.map((r) => {
    const data = r.data ?? {}
    const payoutRaw = data.payout
    const pnlRaw = data.pnl
    const adlFactorRaw = data.adlFactor
    const payout = payoutRaw == null ? null : Number(payoutRaw)
    const pnl = pnlRaw == null ? null : Number(pnlRaw)
    const adlFactor = adlFactorRaw == null ? null : Number(adlFactorRaw)
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
      payout: payout != null && Number.isFinite(payout) ? payout : null,
      pnl: pnl != null && Number.isFinite(pnl) ? pnl : null,
      adlFactor:
        adlFactor != null &&
        Number.isFinite(adlFactor) &&
        adlFactor >= 0 &&
        adlFactor <= 1
          ? adlFactor
          : null,
      userName: r.user_name,
      username: r.username,
      avatarUrl: r.avatar_url,
    }
  })
}
