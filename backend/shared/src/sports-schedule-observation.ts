import type { SupabaseDirectClient } from './supabase/init'

type DB = Pick<SupabaseDirectClient, 'none'>

export type ScheduleConflict = {
  counterpart_contract_ids: string[]
  same_event_contract_ids: string[]
  participant_mismatch: boolean
}

export function describeOddsConflict(conflict: Partial<ScheduleConflict>) {
  return [
    conflict.counterpart_contract_ids?.length &&
      `overlaps open BDL market${
        conflict.counterpart_contract_ids.length > 1 ? 's' : ''
      } ${conflict.counterpart_contract_ids.join(', ')}`,
    conflict.same_event_contract_ids?.length &&
      `multiple unresolved Odds markets: ${conflict.same_event_contract_ids.join(
        ', '
      )}`,
    conflict.participant_mismatch &&
      'provider participants differ from the stored market',
  ]
    .filter(Boolean)
    .join('; ')
}

// Read one clock immediately before the HTTP request, shared across worker hosts.
// Keep PostgreSQL microseconds as text. Tied/backwards samples wait for a fresh read.
export const scheduleFetchStartedAt = async (
  pg: Pick<SupabaseDirectClient, 'one'>
) =>
  (await pg.one<{ stamp: string }>(`select clock_timestamp()::text as stamp`))
    .stamp

export async function saveScheduleObservation(
  db: DB,
  id: string,
  stamp: string,
  conflict?: ScheduleConflict
) {
  await db.none(
    `insert into sports_market_schedule_observations
      (contract_id,provider,observed_at,counterpart_contract_ids,same_event_contract_ids,participant_mismatch)
      values ($1,'odds',$2::timestamptz,$3::text[],$4::text[],$5)
      on conflict (contract_id,provider) do update set
        observed_at = excluded.observed_at, counterpart_contract_ids = excluded.counterpart_contract_ids,
        same_event_contract_ids = excluded.same_event_contract_ids, participant_mismatch = excluded.participant_mismatch
      where sports_market_schedule_observations.observed_at < excluded.observed_at`,
    [
      id,
      stamp,
      conflict?.counterpart_contract_ids ?? [],
      conflict?.same_event_contract_ids ?? [],
      conflict?.participant_mismatch ?? false,
    ]
  )
}
