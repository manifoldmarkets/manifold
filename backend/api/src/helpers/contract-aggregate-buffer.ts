import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log, metrics } from 'shared/utils'
import { debounce } from './debounce'

// Deferred, debounced writer for a contract's display aggregates.
//
// For independent (non-sum-to-one) multiple-choice markets, the per-bet
// transaction omits the shared contract row so concurrent answer-bets touch only
// disjoint rows. The contract row holds eventually-consistent, recomputable
// display state (volume, uniqueBettorCount, lastBetTime, and the denormalized
// data.answers cache whose source of truth is the `answers` table), applied here
// with atomic SQL so concurrent answers never collide on it.
//
// Drift on crash is bounded by the debounce window and self-heals via the
// unique-bettor / volume backfills.

type Agg = {
  volume: number
  uniqueBettors: number
  lastBetTime: number
  answersChanged: boolean
}

const buffers = new Map<string, Agg>()
const FLUSH_MS = 150

export const bufferContractAggregate = (
  contractId: string,
  delta: Agg
) => {
  const cur =
    buffers.get(contractId) ??
    { volume: 0, uniqueBettors: 0, lastBetTime: 0, answersChanged: false }
  cur.volume += delta.volume
  cur.uniqueBettors += delta.uniqueBettors
  cur.lastBetTime = Math.max(cur.lastBetTime, delta.lastBetTime)
  cur.answersChanged = cur.answersChanged || delta.answersChanged
  buffers.set(contractId, cur)
  debounce(`contract-agg-${contractId}`, () => flushContractAggregate(contractId), FLUSH_MS)
}

export const flushContractAggregate = async (contractId: string) => {
  const agg = buffers.get(contractId)
  if (!agg) return
  buffers.delete(contractId)

  const pg = createSupabaseDirectClient()
  try {
    await pg.tx(async (t) => {
      // Recomputable display state -> skipping the fsync is safe and removes the
      // aggregate write from the durability-critical path entirely.
      await t.none('set local synchronous_commit = off')
      await t.none(
        `update contracts c set data = c.data
           || jsonb_build_object(
                'volume', coalesce((c.data->>'volume')::numeric, 0) + $2,
                'uniqueBettorCount', coalesce((c.data->>'uniqueBettorCount')::int, 0) + $3,
                'lastBetTime', greatest(coalesce((c.data->>'lastBetTime')::bigint, 0), $4),
                'lastUpdatedTime', $4)
           || case when $5 then jsonb_build_object('answers', (
                select coalesce(jsonb_agg(a.data order by (a.data->>'index')::int), '[]'::jsonb)
                from answers a where a.contract_id = $1
              )) else '{}'::jsonb end
         where c.id = $1`,
        [contractId, agg.volume, agg.uniqueBettors, agg.lastBetTime, agg.answersChanged]
      )
    })
    metrics.inc('bet/contract_agg_flush')
  } catch (err) {
    // Re-buffer so the deltas aren't lost; the debounce will retry.
    bufferContractAggregate(contractId, agg)
    log.error('contract aggregate flush failed', { err, contractId })
  }
}

// Flush all pending buffers — call on graceful shutdown so a planned restart
// (the daily pm2 cron_restart) cannot drop deltas inside the debounce window.
export const flushAllContractAggregates = async () => {
  await Promise.all([...buffers.keys()].map(flushContractAggregate))
}
