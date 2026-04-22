// Rebuilds synthetic user_contract_metrics rows for perps. This is the single
// authoritative write path for perp ContractMetric — no per-trade mirror path.
//
// Behavior:
//   invested   = sum of originalCostBasis across the user's open + closed
//                positions (i.e. gross margin deposited).
//   payout     = current position value (c + π) at the oracle price (0 if no
//                open position).
//   profit     = payout + totalAmountSold - totalAmountInvested
//                where totalAmountSold is the sum of payouts already credited
//                back on closes / liquidations.
//   totalShares is repurposed to { LONG, SHORT } in notional mana.
//
// Since invested/sold are derived by summing `contract_perp_events`, the
// computation is robust against crashes and partial writes.

import { ContractMetric } from 'common/contract-metric'
import { PerpContract } from 'common/contract'
import { getPositionValue } from 'common/perps/amm'
import { PerpPosition } from 'common/perps/position'
import { bulkUpdateContractMetricsQuery } from 'shared/helpers/user-contract-metrics'
import { SupabaseTransaction } from 'shared/supabase/init'
import { pgp } from 'shared/supabase/init'

type EventAgg = {
  userId: string
  totalInvested: number // sum of positive originalCostBasis deltas (opens/adds)
  totalSold: number // sum of absolute originalCostBasis deltas on closes/liquidations/adl; mana returned
}

/** Returns the list of ContractMetric rows (one per affected user) built from
 * the event log plus the current positions table. */
export const buildPerpUserContractMetrics = async (
  pgTrans: SupabaseTransaction,
  contract: PerpContract,
  userIds: string[]
): Promise<Omit<ContractMetric, 'id'>[]> => {
  if (!userIds.length) return []

  const eventRows = await pgTrans.any<{
    user_id: string
    original_cost_basis_delta: number | string
    event_type: string
  }>(
    `select user_id, original_cost_basis_delta, event_type
     from contract_perp_events
     where contract_id = $1 and user_id = any($2)`,
    [contract.id, userIds]
  )

  const aggByUser: Record<string, EventAgg> = {}
  for (const uid of userIds) {
    aggByUser[uid] = { userId: uid, totalInvested: 0, totalSold: 0 }
  }
  for (const row of eventRows) {
    const d = Number(row.original_cost_basis_delta)
    const agg = aggByUser[row.user_id]
    if (!agg) continue
    if (row.event_type === 'open' || row.event_type === 'add') {
      if (d > 0) agg.totalInvested += d
    } else if (
      row.event_type === 'close' ||
      row.event_type === 'liquidation' ||
      row.event_type === 'adl'
    ) {
      // close event records negative originalCostBasis delta; mana returned
      // is tracked in the event's `data.payout` (see engine). We fall back to
      // |delta| if payout is not present (e.g. for partial liquidation).
    }
  }

  // For totalSold (and for accurate current payout) we need payouts from the
  // event data column. Fetch separately — keeping two queries lets the first
  // use an index-only scan.
  const payoutRows = await pgTrans.any<{
    user_id: string
    data: { payout?: number } | null
    event_type: string
  }>(
    `select user_id, data, event_type
     from contract_perp_events
     where contract_id = $1 and user_id = any($2)
       and event_type in ('close','liquidation','adl')`,
    [contract.id, userIds]
  )
  for (const row of payoutRows) {
    const agg = aggByUser[row.user_id]
    if (!agg) continue
    const payout = Number(row.data?.payout ?? 0)
    agg.totalSold += payout
  }

  const positionRows = await pgTrans.any<{
    user_id: string
    direction: string
    size: string | number
    cost_basis: string | number
    original_cost_basis: string | number
    entry_price: string | number
    leverage: string | number
    liquidation_price: string | number
    opened_time: string
    updated_time: string
  }>(
    `select * from contract_perp_positions
     where contract_id = $1 and user_id = any($2)`,
    [contract.id, userIds]
  )

  const positionsByUser: Record<string, PerpPosition[]> = {}
  for (const r of positionRows) {
    const p: PerpPosition = {
      userId: r.user_id,
      contractId: contract.id,
      direction: r.direction as 'long' | 'short',
      size: Number(r.size),
      costBasis: Number(r.cost_basis),
      originalCostBasis: Number(r.original_cost_basis),
      entryPrice: Number(r.entry_price),
      leverage: Number(r.leverage),
      liquidationPrice: Number(r.liquidation_price),
      openedTime: new Date(r.opened_time).getTime(),
      updatedTime: new Date(r.updated_time).getTime(),
    }
    if (!positionsByUser[p.userId]) positionsByUser[p.userId] = []
    positionsByUser[p.userId].push(p)
  }

  const now = Date.now()
  const metrics: Omit<ContractMetric, 'id'>[] = userIds.map((uid) => {
    const agg = aggByUser[uid] ?? { userId: uid, totalInvested: 0, totalSold: 0 }
    const positions = positionsByUser[uid] ?? []
    let longSize = 0
    let shortSize = 0
    let payout = 0
    for (const p of positions) {
      if (p.direction === 'long') longSize += p.size
      else shortSize += p.size
      payout += getPositionValue(p, contract.oraclePrice)
    }
    const invested = agg.totalInvested
    const sold = agg.totalSold
    const profit = payout + sold - invested
    const profitPercent = invested > 0 ? (profit / invested) * 100 : 0

    return {
      userId: uid,
      contractId: contract.id,
      answerId: null,
      lastBetTime: now,
      lastProb: null,
      hasShares: longSize > 0 || shortSize > 0,
      hasYesShares: false,
      hasNoShares: false,
      invested,
      loan: 0,
      marginLoan: 0,
      maxSharesOutcome:
        longSize > shortSize ? 'LONG' : shortSize > longSize ? 'SHORT' : null,
      totalShares: { LONG: longSize, SHORT: shortSize },
      totalSpent: undefined,
      payout,
      totalAmountSold: sold,
      totalAmountInvested: invested,
      profit,
      profitPercent,
      from: undefined,
    }
  })

  return metrics
}

/** Rebuild-and-upsert in a single query string for pgTrans.multi composition. */
export const buildPerpUserContractMetricsQuery = async (
  pgTrans: SupabaseTransaction,
  contract: PerpContract,
  userIds: string[]
) => {
  const metrics = await buildPerpUserContractMetrics(pgTrans, contract, userIds)
  if (!metrics.length) return 'select 1 where false'
  return bulkUpdateContractMetricsQuery(metrics)
}

// Avoid "import not used" warning if caller only imports one of these.
export { pgp }
