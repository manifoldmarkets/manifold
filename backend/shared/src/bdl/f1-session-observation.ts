import { randomUUID } from 'node:crypto'
import type { F1Session } from 'common/f1-markets'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import type { SupabaseDirectClient } from '../supabase/init'

const official = `c.creator_id=any($1) and c.token='MANA' and c.resolution is null
  and c.visibility='public' and c.deleted is not true
  and c.data->>'sportsFixture' is distinct from 'true'
  and coalesce(c.data->>'sportsProvider','bdl')='bdl' and coalesce(c.data->>'sportsLeagueKey','f1')='f1'`

export async function beginF1Observation(
  pg: SupabaseDirectClient,
  eventIds: number[]
) {
  const receipt = randomUUID()
  // Commit the pending read before dispatch. A crash, a failed completion or
  // another overlapping worker cannot silently carry over a terminal clock.
  await pg.none(
    `update contracts c set data=
    (case when c.data ? 'sportsF1SchedulePending' then c.data - 'sportsCanceledSince' - 'sportsFinalSince'
      else c.data end) || jsonb_build_object('sportsF1SchedulePending',$2::text)
    where ${official} and c.data->>'sportsEventId' like 'bdl-f1:%'
      and c.data->>'sportsEventId' like any($3::text[])`,
    [MANIFOLD_SPORTS_USER_IDS, receipt, eventIds.map((id) => `bdl-f1:${id}:%`)]
  )
  return receipt
}

type StoredMarks = {
  id: string
  finalSince: number | null
  canceledSince: number | null
}
// Bare SQL NULL, JSON null, text, fractions and future clocks cannot attest
// to elapsed time. Keep only a positive integer within this receipt's window.
function terminalSince(key: 'sportsFinalSince' | 'sportsCanceledSince') {
  return `case when jsonb_typeof(c.data->'${key}')='number' and c.data->>'${key}' ~ '^[1-9][0-9]{0,15}$'
    then case when (c.data->>'${key}')::bigint<=$4 then c.data->'${key}' end end`
}
export async function finishF1Observation(
  pg: SupabaseDirectClient,
  receipt: string,
  eventIds: number[],
  sessions: F1Session[],
  at: number
) {
  if (!Number.isSafeInteger(at) || at <= 0)
    throw new Error('Invalid F1 observation time')
  const states = Object.fromEntries(
    sessions.map((s) => [`bdl-f1:${s.event.id}:${s.id}`, s.status_state])
  )
  // The provider returned the complete weekend. Unlisted and quarantined
  // sessions both lose confirmation, even when their contracts are off-page.
  const rows = await pg.manyOrNone<StoredMarks>(
    `update contracts c set data =
    (c.data - 'sportsF1SchedulePending' - 'sportsCanceledSince' - 'sportsFinalSince') ||
    jsonb_build_object('sportsF1ScheduleReceipt',$2::text) ||
    case $3::jsonb->>(c.data->>'sportsEventId')
      when 'canceled' then jsonb_build_object('sportsCanceledSince',coalesce(${terminalSince(
        'sportsCanceledSince'
      )},to_jsonb($4::bigint)))
      when 'final' then jsonb_build_object('sportsFinalSince',coalesce(${terminalSince(
        'sportsFinalSince'
      )},to_jsonb($4::bigint)))
      else '{}'::jsonb end
    where ${official} and c.data->>'sportsEventId' like 'bdl-f1:%'
      and c.data->>'sportsEventId' like any($5::text[]) and c.data->>'sportsF1SchedulePending'=$2
    returning c.id,c.data->'sportsFinalSince' as "finalSince",c.data->'sportsCanceledSince' as "canceledSince"`,
    [
      MANIFOLD_SPORTS_USER_IDS,
      receipt,
      states,
      at,
      eventIds.map((id) => `bdl-f1:${id}:%`),
    ]
  )
  return new Map(
    rows.map((r) => [
      r.id,
      {
        finalSince: r.finalSince ?? undefined,
        canceledSince: r.canceledSince ?? undefined,
      },
    ])
  )
}
