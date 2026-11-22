import { createHash } from 'node:crypto'
import {
  checkedClassification,
  F1Session,
  F1SessionResult,
} from 'common/f1-markets'
import {
  calendarPhaseKey,
  phaseWindow,
  SPORTS_CALENDAR,
} from 'common/sports-calendar'
import type { MarketContract, SportsContract } from 'common/contract'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import type { SupabaseDirectClient } from '../supabase/init'
import { log } from '../utils'
import { BDL_CORRECTION_WATCH_MS } from 'common/bdl/constants'
import { f1WatchEnabled } from './f1-read-role'
import { f1TerminalEditSql } from './f1-watch-enrollment'
export { f1WatchEnabled } from './f1-read-role'

export type F1Watch = NonNullable<SportsContract['sportsF1Watch']>
const positiveId = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v > 0

/** Hash the classification, independent of listing order and driver name changes. */
export function f1ClassificationHash(
  sessionId: number,
  rows: F1SessionResult[]
) {
  if (
    !positiveId(sessionId) ||
    rows.length === 0 ||
    !rows.every(
      (r) =>
        r?.session?.id === sessionId &&
        positiveId(r.driver?.id) &&
        (r.position === null || positiveId(r.position)) &&
        typeof r.is_winner === 'boolean' &&
        (r.retired === null || typeof r.retired === 'boolean') &&
        (r.laps_completed === null ||
          (Number.isSafeInteger(r.laps_completed) && r.laps_completed >= 0))
    )
  )
    return
  if (!checkedClassification(rows)?.first) return
  const classified = rows
    .map(
      (r) =>
        [
          r.driver.id,
          r.position,
          r.is_winner,
          r.retired,
          r.laps_completed,
        ] as const
    )
    .sort((a, b) => a[0] - b[0])
  return createHash('sha256')
    .update(JSON.stringify([sessionId, classified]))
    .digest('hex')
}

export function f1WatchSeed(
  eventId: string,
  session: F1Session,
  results: F1SessionResult[]
) {
  if (
    !f1WatchEnabled() ||
    !positiveId(session?.event?.id) ||
    !positiveId(session.id) ||
    eventId !== `bdl-f1:${session.event.id}:${session.id}` ||
    session.status_state !== 'final'
  )
    return
  const at = Date.parse(session.date)
  const phases = SPORTS_CALENDAR.filter((p) => {
    if (
      p.provider !== 'bdl-f1' ||
      p.competitionId !== 'f1-' + session.event.season
    )
      return false
    const { from, to } = phaseWindow(p)
    return at >= from && at <= to
  })
  const baseline =
    phases.length === 1 ? f1ClassificationHash(session.id, results) : undefined
  return baseline
    ? {
        eventId,
        phase: calendarPhaseKey(phases[0]),
        baseline,
        fieldSize: results.length,
      }
    : undefined
}

// This mark proves eligibility, never a classification. Concurrent resolvers
// can agree on the paid answers and disagree elsewhere in the field.
export async function noteF1WatchScope(
  pg: SupabaseDirectClient,
  id: string,
  { eventId, phase }: { eventId: string; phase: string }
) {
  if (!f1WatchEnabled()) return
  try {
    await pg.none(
      `with scope as (
        select jsonb_build_object('eventId',$2::text,'phase',$3::text,
          'activation',extract(epoch from s.updated_time)::text) as mark
        from sports_competition_switches s
        where s.competition_id || ':' || s.phase=$3 and s.enabled
      )
      update contracts c set data=c.data || jsonb_build_object('sportsF1WatchScope',scope.mark)
      from scope where c.id=$1 and c.resolution is null and c.data->>'sportsEventId'=$2
        and c.creator_id=any($4) and c.visibility='public' and c.token='MANA' and c.deleted is not true
        and c.outcome_type='MULTIPLE_CHOICE' and c.data->>'sportsMarketType' in ('winner','podium')
        and c.data->>'sportsFixture' is distinct from 'true'
        and coalesce(c.data->>'sportsProvider','bdl')='bdl' and coalesce(c.data->>'sportsLeagueKey','f1')='f1'
        and c.data->'sportsF1WatchScope' is distinct from scope.mark`,
      [id, eventId, phase, MANIFOLD_SPORTS_USER_IDS]
    )
  } catch {
    log.error('[sports-bdl-watch] Could not record F1 watch eligibility', {
      contractId: id,
    })
  }
}

/** Enroll only the exact completed payout returned by the ordinary resolver.
 * Missing enrollment never grants permission to infer a baseline from a later read.
 */
export async function recordF1WatchBaseline(
  pg: SupabaseDirectClient,
  paid: MarketContract,
  seed: NonNullable<ReturnType<typeof f1WatchSeed>>
) {
  const { resolution, resolutionTime, id } = paid
  const now = Date.now()
  if (
    !f1WatchEnabled() ||
    !paid.isResolved ||
    !resolution ||
    resolution === 'CANCEL' ||
    !resolutionTime ||
    !Number.isSafeInteger(resolutionTime) ||
    !Number.isSafeInteger(now) ||
    now < resolutionTime ||
    now - resolutionTime >= BDL_CORRECTION_WATCH_MS ||
    (paid as SportsContract).sportsEventId !== seed.eventId ||
    !positiveId(seed.fieldSize) ||
    !/^[a-f0-9]{64}$/.test(seed.baseline)
  )
    return
  const watch: F1Watch = {
    ...seed,
    resolutionTime,
    checkedTime: resolutionTime,
    observedHash: seed.baseline,
  }
  try {
    await pg.none(
      `update contracts c set data = c.data || jsonb_build_object('sportsF1Watch',$1::jsonb)
    where c.id=$2 and c.data->>'sportsEventId'=$3 and c.resolution=$4 and c.resolution_time=$5
      and c.creator_id=any($6) and c.data->>'resolverId'=c.creator_id
      and c.visibility='public' and c.token='MANA' and c.deleted is not true
      and c.outcome_type='MULTIPLE_CHOICE' and c.data->>'sportsMarketType' in ('winner','podium')
      and c.data->>'sportsFixture' is distinct from 'true' and coalesce(c.data->>'sportsProvider','bdl')='bdl'
      and coalesce(c.data->>'sportsLeagueKey','f1')='f1'
      and c.data#>'{sportsF1Watch,resolutionTime}' is distinct from to_jsonb($7::bigint)
      and ${f1TerminalEditSql(false)}
      and exists (select 1 from sports_competition_switches s where
        s.competition_id || ':' || s.phase=$8 and s.enabled)`,
      [
        watch,
        id,
        seed.eventId,
        resolution,
        new Date(resolutionTime),
        MANIFOLD_SPORTS_USER_IDS,
        resolutionTime,
        seed.phase,
      ]
    )
  } catch {
    log.error('[sports-bdl-watch] Could not enroll the settled F1 market', {
      contractId: id,
    })
  }
}
