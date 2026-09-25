import { calculatePerpHistoricalValues } from 'common/perps/metric-periods'
import type { PerpEvent } from 'common/perps/position'
import type { Row } from 'common/supabase/utils'
import { rowToPosition } from './queries'

type EventRow = {
  id: number
  contract_id: string
  user_id: string
  event_type: PerpEvent['eventType']
  ts: string
  applied_ts: string
  oracle_price: number | null
  size_delta: number
  cost_basis_delta: number
  original_cost_basis_delta: number
  direction: PerpEvent['direction']
  leverage: number | null
  data: Record<string, unknown> | null
}
export type PerpHouseBackfillInput = {
  positions: Row<'contract_perp_positions'>[]
  events: EventRow[]
  snapshots: { hour: string; cutoff: string; oracle_price: number }[]
}

// One statement gives a coherent snapshot of live positions and their event log.
// Backfill runs once, per contract, rather than replaying history on page requests.
export const PERP_HOUSE_BACKFILL_QUERY = `
select
  coalesce((select jsonb_agg(p) from contract_perp_positions p where p.contract_id = $1 and p.size > 0), '[]') as positions,
  coalesce((select jsonb_agg(jsonb_build_object(
    'id', e.id, 'contract_id', e.contract_id, 'user_id', e.user_id,
    'event_type', e.event_type, 'ts', e.ts, 'applied_ts', e.applied_ts,
    'oracle_price', e.oracle_price, 'size_delta', e.size_delta,
    'cost_basis_delta', e.cost_basis_delta, 'original_cost_basis_delta', e.original_cost_basis_delta,
    'direction', e.direction, 'leverage', e.leverage,
    'data', e.data - 'request' - 'response' - 'idempotencyKey'
  ) order by e.id desc) from contract_perp_events e
    where e.contract_id = $1 and e.user_id is not null), '[]') as events,
  coalesce((select jsonb_agg(jsonb_build_object(
    'hour', s.hour, 'oracle_price', s.oracle_price,
    'cutoff', greatest(s.captured_at, (
      select max(e.applied_ts) from contract_perp_events e
      where e.contract_id = s.contract_id and e.ts = s.captured_at
    )) + interval '1 millisecond'
  ) order by s.hour) from contract_perp_hourly_stats s
    where s.contract_id = $1 and s.source = 'backfill'
      and s.marked_position_value is null), '[]') as snapshots
`

export const calculatePerpHouseBackfill = (input: PerpHouseBackfillInput) => {
  const positions = input.positions.map(rowToPosition)
  const events: PerpEvent[] = input.events.map((e) => ({
    id: Number(e.id),
    contractId: e.contract_id,
    userId: e.user_id,
    eventType: e.event_type,
    appliedTime: new Date(e.applied_ts).getTime(),
    ts: new Date(e.ts).getTime(),
    oraclePrice: Number(e.oracle_price),
    sizeDelta: Number(e.size_delta),
    costBasisDelta: Number(e.cost_basis_delta),
    originalCostBasisDelta: Number(e.original_cost_basis_delta),
    direction: e.direction,
    leverage: e.leverage == null ? null : Number(e.leverage),
    data: e.data ?? undefined,
  }))
  const users = new Set([
    ...positions.map((p) => p.userId),
    ...events.map((e) => e.userId),
  ])
  const values: (number | null)[] = input.snapshots.map(() => 0)
  const cutoffs = input.snapshots.map((s) => ({
    cutoff: new Date(s.cutoff).getTime(),
    price: Number(s.oracle_price),
  }))
  for (const user of users) {
    const userValues = calculatePerpHistoricalValues({
      currentPositions: positions.filter((p) => p.userId === user),
      events: events.filter((e) => e.userId === user),
      cutoffs,
    })
    userValues.forEach((value, i) => {
      const sum = value == null || values[i] == null ? null : values[i]! + value
      values[i] = sum != null && Number.isFinite(sum) ? sum : null
    })
  }
  return input.snapshots.map((snapshot, i) => ({
    hour: snapshot.hour,
    marked_position_value: values[i],
  }))
}

// Never overwrite a live capture, even if it was written during the replay.
export const PERP_HOUSE_BACKFILL_UPDATE = `
update contract_perp_hourly_stats s set marked_position_value = v.marked_position_value
from jsonb_to_recordset($2::jsonb) as v(hour timestamptz, marked_position_value numeric)
where s.contract_id = $1 and s.hour = v.hour and s.source = 'backfill'
  and s.marked_position_value is null and v.marked_position_value is not null
`
