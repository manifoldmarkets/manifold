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
  lastBetTime: number
}

const emptyAgg = (userId: string): EventAgg => ({
  userId,
  totalInvested: 0,
  totalSold: 0,
  lastBetTime: 0,
})

const isSoldEventType = (t: string) =>
  t === 'close' || t === 'liquidation' || t === 'adl'

const applyEventToAgg = (
  agg: EventAgg,
  eventType: string,
  originalCostBasisDelta: number,
  payout: number,
  appliedTime: number,
  reason: unknown
) => {
  if (eventType === 'open' || eventType === 'add') {
    if (originalCostBasisDelta > 0) agg.totalInvested += originalCostBasisDelta
  } else if (isSoldEventType(eventType)) {
    agg.totalSold += payout
  }
  if (
    eventType === 'open' ||
    eventType === 'add' ||
    (eventType === 'close' && reason !== 'resolve-market')
  ) {
    agg.lastBetTime = Math.max(agg.lastBetTime, appliedTime)
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

  // Aggregate the append-only history in SQL. Returning one row per user
  // avoids shipping every hourly funding event back to Node on each rebuild.
  const historicalRows = await pgTrans.any<{
    user_id: string
    total_invested: number | string
    total_sold: number | string
    last_bet_time: string | null
  }>(
    `select
       user_id,
       coalesce(sum(
         case
           when event_type in ('open', 'add')
             and original_cost_basis_delta > 0
           then original_cost_basis_delta
           else 0
         end
       ), 0) as total_invested,
       coalesce(sum(
         case
           when event_type in ('close', 'liquidation', 'adl')
           then coalesce((data->>'payout')::numeric, 0)
           else 0
         end
       ), 0) as total_sold,
       max(applied_ts) filter (
         where event_type in ('open', 'add')
           or (
             event_type = 'close'
             and data->>'reason' is distinct from 'resolve-market'
           )
       ) as last_bet_time
     from contract_perp_events
     where contract_id = $1
       and user_id = any($2)
       and event_type in ('open', 'add', 'close', 'liquidation', 'adl')
     group by user_id`,
    [contract.id, userIds]
  )
  for (const row of historicalRows) {
    const agg = aggByUser[row.user_id]
    if (!agg) continue
    const invested = Number(row.total_invested)
    const sold = Number(row.total_sold)
    const lastBetTime =
      row.last_bet_time === null ? 0 : new Date(row.last_bet_time).getTime()
    if (
      !Number.isFinite(invested) ||
      invested < 0 ||
      !Number.isFinite(sold) ||
      sold < 0 ||
      !Number.isFinite(lastBetTime)
    ) {
      throw new Error(`Invalid PERP event history for ${contract.id}`)
    }
    agg.totalInvested = invested
    agg.totalSold = sold
    agg.lastBetTime = lastBetTime
  }

  // Apply this transaction's new events on top so the metrics reflect
  // post-tx state even though the writes haven't been flushed yet.
  for (const ev of newEvents) {
    if (!ev.userId) continue
    const agg = aggByUser[ev.userId]
    if (!agg) continue
    const payout = Number((ev.data as { payout?: number } | null)?.payout ?? 0)
    if (
      !Number.isFinite(payout) ||
      payout < 0 ||
      !Number.isFinite(ev.appliedTime)
    ) {
      throw new Error(`Invalid new PERP event for ${contract.id}`)
    }
    applyEventToAgg(
      agg,
      ev.eventType,
      ev.originalCostBasisDelta ?? 0,
      payout,
      ev.appliedTime,
      ev.data?.reason
    )
  }

  const positionsByUser: Record<string, PerpPosition[]> = {}
  for (const p of finalPositions) {
    if (p.size <= 0) continue
    if (!positionsByUser[p.userId]) positionsByUser[p.userId] = []
    positionsByUser[p.userId].push(p)
  }

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
      // Funding, liquidation, ADL, and settlement are system activity. Using
      // rebuild time here made passive holders look like weekly traders.
      lastBetTime: agg.lastBetTime,
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
  return bulkUpdateContractMetricsQuery(metrics, { preserveFrom: true })
}
