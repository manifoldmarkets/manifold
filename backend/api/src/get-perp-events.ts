import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIError, APIHandler } from './helpers/endpoint'

// Fetches the event log for a perp contract with user info joined, paginated
// by id (DESC). Excludes pool-level funding and aggregate ADL audit events:
// neither is a user trade, and showing their null user as "anon" spams and
// misrepresents the public Trades tab. Funding is surfaced by its chart, while
// each affected ADL position already has its own user-attributed event.
// Basis-settlement receipts (protected accounting) are user-attributed but
// are not trades either: they are returned only when the caller asks for one
// user's history, where they explain that holder's changed recovery rights.
// Used by the Trades tab and user position history.
export const getPerpEvents: APIHandler<'get-perp-events'> = async (body) => {
  const { contractId, userId, beforeId, limit = 50, excludeApi } = body
  // One market, or a merged newest-first tape across several (the /perps
  // hub) — ids are global, so one ordered query serves both.
  const contractIds = body.contractIds ?? (contractId ? [contractId] : [])
  if (contractIds.length === 0) {
    throw new APIError(400, 'contractId or contractIds is required')
  }
  const pg = createSupabaseDirectClient()

  const rows = await pg.manyOrNone<{
    id: number
    contract_id: string
    ts: string
    user_id: string | null
    direction: string | null
    event_type: string
    oracle_price: number | string | null
    size_delta: number | string
    cost_basis_delta: number | string
    reserve_basis_delta: number | string
    original_cost_basis_delta: number | string
    leverage: number | string | null
    data: Record<string, unknown> | null
    user_name: string | null
    username: string | null
    avatar_url: string | null
  }>(
    `select e.id, e.contract_id, e.ts, e.user_id, e.direction, e.event_type,
            e.oracle_price, e.size_delta, e.cost_basis_delta,
            e.reserve_basis_delta,
            e.original_cost_basis_delta, e.leverage, e.data,
            u.name as user_name, u.username, u.data->>'avatarUrl' as avatar_url
       from contract_perp_events e
       left join users u on u.id = e.user_id
      where e.contract_id = any($1::text[])
        and e.event_type <> 'funding'
        and e.event_type <> 'accounting-activation'
        and ($2::text is not null or e.event_type <> 'basis-settlement')
        and e.user_id is not null
        and ($2::text is null or e.user_id = $2::text)
        and ($3::bigint is null or e.id < $3::bigint)
        and ($5::boolean is not true or e.data->>'isApi' is distinct from 'true')
      order by e.id desc
      limit $4`,
    [contractIds, userId ?? null, beforeId ?? null, limit, excludeApi ?? false]
  )

  return rows.map((r) => {
    const data = r.data ?? {}
    const payoutRaw = data.payout
    const pnlRaw = data.pnl
    const adlFactorRaw = data.adlFactor
    const fractionRaw = data.fraction
    const reserveBasisAfterRaw = data.reserveBasisAfter
    const payout = payoutRaw == null ? null : Number(payoutRaw)
    const pnl = pnlRaw == null ? null : Number(pnlRaw)
    const adlFactor = adlFactorRaw == null ? null : Number(adlFactorRaw)
    const fraction = fractionRaw == null ? null : Number(fractionRaw)
    const reserveBasisAfter =
      reserveBasisAfterRaw == null ? null : Number(reserveBasisAfterRaw)
    return {
      id: Number(r.id),
      contractId: r.contract_id,
      ts: new Date(r.ts).getTime(),
      userId: r.user_id,
      direction: r.direction as 'long' | 'short' | null,
      eventType: r.event_type as
        | 'open'
        | 'add'
        | 'close'
        | 'liquidation'
        | 'adl'
        | 'funding'
        | 'basis-settlement',
      oraclePrice: Number(r.oracle_price ?? 0),
      sizeDelta: Number(r.size_delta),
      costBasisDelta: Number(r.cost_basis_delta),
      reserveBasisDelta: Number(r.reserve_basis_delta),
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
      fraction:
        fraction != null &&
        Number.isFinite(fraction) &&
        fraction > 0 &&
        fraction <= 1
          ? fraction
          : null,
      reserveBasisAfter:
        reserveBasisAfter != null &&
        Number.isFinite(reserveBasisAfter) &&
        reserveBasisAfter >= 0
          ? reserveBasisAfter
          : null,
      isApi: data.isApi === true,
      userName: r.user_name,
      username: r.username,
      avatarUrl: r.avatar_url,
    }
  })
}
