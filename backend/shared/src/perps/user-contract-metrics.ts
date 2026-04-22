// Rebuilds synthetic user_contract_metrics rows for perps. This is the single
// authoritative write path for perp ContractMetric — no per-trade mirror path.
//
// Behavior:
//   invested   = sum of positive originalCostBasis deltas across the user's
//                open + closed positions (gross margin deposited).
//   payout     = current position value (c + π) at the oracle price (0 if no
//                open position).
//   profit     = payout + totalAmountSold - totalAmountInvested
//                where totalAmountSold is the sum of payouts already credited
//                back on closes / liquidations.
//   totalShares is repurposed to { LONG, SHORT } in notional mana.
//   maxSharesOutcome is always null — perps don't fit the YES/NO taxonomy and
//                we keep side info in totalShares instead.
//
// The caller passes the *post-transaction* event list and position list so we
// don't need to re-read the DB (which would return pre-tx state when this
// runs inside a pgTrans.multi composition).

import { ContractMetric } from 'common/contract-metric'
import { PerpContract } from 'common/contract'
import { getPositionValue } from 'common/perps/amm'
import { PerpEvent, PerpPosition } from 'common/perps/position'
import { bulkUpdateContractMetricsQuery } from 'shared/helpers/user-contract-metrics'
import { SupabaseTransaction } from 'shared/supabase/init'

type EventAgg = {
  userId: string
  totalInvested: number
  totalSold: number
}

const emptyAgg = (userId: string): EventAgg => ({
  userId,
  totalInvested: 0,
  totalSold: 0,
})

const isSoldEventType = (t: string) =>
  t === 'close' || t === 'liquidation' || t === 'adl'

const applyEventToAgg = (
  agg: EventAgg,
  eventType: string,
  originalCostBasisDelta: number,
  payout: number
) => {
  if (eventType === 'open' || eventType === 'add') {
    if (originalCostBasisDelta > 0) agg.totalInvested += originalCostBasisDelta
  } else if (isSoldEventType(eventType)) {
    agg.totalSold += payout
  }
}

type BuildArgs = {
  contract: PerpContract
  userIds: string[]
  /** Events created by this transaction that aren't yet in the DB. */
  newEvents?: PerpEvent[]
  /** Final positions after the transaction applied its writes. */
  finalPositions: PerpPosition[]
}

/** Returns the list of ContractMetric rows (one per affected user) built from
 * the historical event log plus this transaction's new events and the final
 * in-memory position state. */
export const buildPerpUserContractMetrics = async (
  pgTrans: SupabaseTransaction,
  { contract, userIds, newEvents = [], finalPositions }: BuildArgs
): Promise<Omit<ContractMetric, 'id'>[]> => {
  if (!userIds.length) return []

  const aggByUser: Record<string, EventAgg> = Object.fromEntries(
    userIds.map((uid) => [uid, emptyAgg(uid)])
  )

  // Historical invested (from open/add events already in DB).
  const investedRows = await pgTrans.any<{
    user_id: string
    original_cost_basis_delta: number | string
  }>(
    `select user_id, original_cost_basis_delta
     from contract_perp_events
     where contract_id = $1
       and user_id = any($2)
       and event_type in ('open','add')`,
    [contract.id, userIds]
  )
  for (const row of investedRows) {
    const agg = aggByUser[row.user_id]
    if (!agg) continue
    const d = Number(row.original_cost_basis_delta)
    if (d > 0) agg.totalInvested += d
  }

  // Historical sold (from close/liquidation/adl events already in DB).
  const soldRows = await pgTrans.any<{
    user_id: string
    data: { payout?: number } | null
    event_type: string
  }>(
    `select user_id, data, event_type
     from contract_perp_events
     where contract_id = $1
       and user_id = any($2)
       and event_type in ('close','liquidation','adl')`,
    [contract.id, userIds]
  )
  for (const row of soldRows) {
    const agg = aggByUser[row.user_id]
    if (!agg) continue
    agg.totalSold += Number(row.data?.payout ?? 0)
  }

  // Apply this transaction's new events on top so the metrics reflect
  // post-tx state even though the writes haven't been flushed yet.
  for (const ev of newEvents) {
    if (!ev.userId) continue
    const agg = aggByUser[ev.userId]
    if (!agg) continue
    const payout = Number((ev.data as { payout?: number } | null)?.payout ?? 0)
    applyEventToAgg(agg, ev.eventType, ev.originalCostBasisDelta ?? 0, payout)
  }

  const positionsByUser: Record<string, PerpPosition[]> = {}
  for (const p of finalPositions) {
    if (p.size <= 0) continue
    if (!positionsByUser[p.userId]) positionsByUser[p.userId] = []
    positionsByUser[p.userId].push(p)
  }

  const now = Date.now()
  return userIds.map((uid) => {
    const agg = aggByUser[uid] ?? emptyAgg(uid)
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
      maxSharesOutcome: null,
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
}

/** Rebuild-and-upsert in a single query string for pgTrans.multi composition. */
export const buildPerpUserContractMetricsQuery = async (
  pgTrans: SupabaseTransaction,
  args: BuildArgs
) => {
  const metrics = await buildPerpUserContractMetrics(pgTrans, args)
  if (!metrics.length) return 'select 1 where false'
  return bulkUpdateContractMetricsQuery(metrics)
}
