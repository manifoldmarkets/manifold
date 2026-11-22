import { DOMAIN } from 'common/envs/constants'
import { BDL_CORRECTION_WATCH_MS } from 'common/bdl/constants'
import { parseF1EventId } from 'common/f1-markets'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import { calendarPhaseKey, SPORTS_CALENDAR } from 'common/sports-calendar'
import { DAY_MS, HOUR_MS } from 'common/util/time'
import { getF1Sessions, getF1SessionResults } from '../balldontlie-f1-client'
import { sendTextEmail } from '../send-email'
import type { SupabaseDirectClient } from '../supabase/init'
import { getCompetitionSwitches } from '../supabase/sports-competition-switches'
import { isProd, log } from '../utils'
import { f1WatchEnabled, f1WatchSeed, type F1Watch } from './f1-classification'

const MAX_RUN_MS = 3 * 60_000
const knownPhases = SPORTS_CALENDAR.filter(
  (p) => p.provider === 'bdl-f1' && !p.locked
).map(calendarPhaseKey)
const hashPattern = /^[0-9a-f]{64}$/
type Row = { id: string; watch: F1Watch }
const isWatched = `c.creator_id=any($1) and c.visibility='public' and c.token='MANA'
  and c.deleted is not true and c.outcome_type='MULTIPLE_CHOICE'
  and c.resolution is not null and c.resolution<>'CANCEL'
  and c.data->>'sportsFixture' is distinct from 'true'
  and coalesce(c.data->>'sportsProvider','bdl')='bdl'
  and coalesce(c.data->>'sportsLeagueKey','f1')='f1'
  and c.data->>'sportsMarketType' in ('winner','podium')
  and c.data->>'sportsEventId' ~ '^bdl-f1:[1-9][0-9]*:[1-9][0-9]*$'
  and c.data#>>'{sportsF1Watch,eventId}' = c.data->>'sportsEventId'
  and c.data#>'{sportsF1Watch,resolutionTime}' = to_jsonb((extract(epoch from c.resolution_time)*1000)::bigint)
  and c.resolution_time > $3::timestamptz and c.resolution_time <= $4::timestamptz`

const dates = (now: number) => [
  new Date(now - BDL_CORRECTION_WATCH_MS),
  new Date(now),
]
export function f1WatchDue(w: F1Watch, now: number) {
  const age = now - w.resolutionTime
  return (
    Number.isSafeInteger(now) &&
    Number.isSafeInteger(w.resolutionTime) &&
    w.resolutionTime > 0 &&
    Number.isSafeInteger(w.fieldSize) &&
    w.fieldSize > 0 &&
    Number.isSafeInteger(w.checkedTime) &&
    w.checkedTime >= w.resolutionTime &&
    typeof w.baseline === 'string' &&
    hashPattern.test(w.baseline) &&
    typeof w.observedHash === 'string' &&
    hashPattern.test(w.observedHash) &&
    age >= 0 &&
    age < BDL_CORRECTION_WATCH_MS &&
    now - w.checkedTime >=
      (age < DAY_MS ? HOUR_MS : age < 3 * DAY_MS ? 6 * HOUR_MS : DAY_MS)
  )
}

export async function runF1CorrectionWatch(
  pg: SupabaseDirectClient,
  clock: () => number = Date.now
) {
  const result = { checked: 0, corrections: 0, unavailable: 0 }
  if (!f1WatchEnabled()) return result
  const started = clock()
  const stillOn = () =>
    f1WatchEnabled() && clock() >= started && clock() - started < MAX_RUN_MS
  const switches = await getCompetitionSwitches(pg)
  const phases = knownPhases.filter((k) => switches[k] === true)
  if (!phases.length) return result
  const rows = await pg.manyOrNone<Row>(
    `select c.id, c.data->'sportsF1Watch' as watch
    from contracts c where ${isWatched} and c.data#>>'{sportsF1Watch,phase}'=any($2)
    order by c.resolution_time, c.id`,
    [MANIFOLD_SPORTS_USER_IDS, phases, ...dates(started)]
  )
  const sessions = new Map<string, Awaited<ReturnType<typeof getF1Sessions>>>()
  const classifications = new Map<string, ReturnType<typeof f1WatchSeed>>()
  for (const { id, watch } of rows) {
    if (!stillOn()) break
    const ids = parseF1EventId(watch.eventId)
    if (!ids || !f1WatchDue(watch, clock())) continue
    const admit = async () =>
      stillOn() &&
      clock() - watch.resolutionTime < BDL_CORRECTION_WATCH_MS &&
      (await getCompetitionSwitches(pg))[watch.phase] === true
    if (!(await admit())) continue
    try {
      const eventKey = watch.phase + ':' + ids.eventId
      let weekend = sessions.get(eventKey)
      if (!weekend) {
        weekend = await getF1Sessions([ids.eventId], admit)
        sessions.set(eventKey, weekend)
      }
      const current = weekend.filter(
        (s) => s?.id === ids.sessionId && s.event?.id === ids.eventId
      )
      const key = watch.phase + ':' + watch.eventId
      if (!classifications.has(key)) {
        const session = current.length === 1 ? current[0] : undefined
        const seed =
          session?.status_state === 'final' && (await admit())
            ? f1WatchSeed(
                watch.eventId,
                session,
                await getF1SessionResults(ids.sessionId, admit)
              )
            : undefined
        classifications.set(key, seed?.phase === watch.phase ? seed : undefined)
      }
      if (!(await admit())) continue
      const now = clock()
      // A truncated nonempty field can still name a winner; its missing
      // rows alone cannot establish a change to the complete classification.
      const classification = classifications.get(key)
      // Older watches recorded only the original field size. A prior corrected
      // digest must be seen again before its size can be recovered safely.
      const lastSize =
        watch.observedFieldSize ??
        (watch.observedHash === watch.baseline ? watch.fieldSize : undefined)
      const accepted =
        classification &&
        classification.fieldSize >= watch.fieldSize &&
        (lastSize === undefined
          ? classification.baseline === watch.observedHash
          : Number.isSafeInteger(lastSize) &&
            lastSize >= watch.fieldSize &&
            classification.fieldSize >= lastSize)
          ? classification
          : undefined
      const changed =
        accepted !== undefined && accepted.baseline !== watch.observedHash
      const next = {
        ...watch,
        checkedTime: now,
        ...(accepted && {
          observedHash: accepted.baseline,
          observedFieldSize: accepted.fieldSize,
        }),
        ...(changed && { correctedTime: now }),
      }
      // Concurrent workers may inspect the same session. Only the one that
      // still sees the exact settlement and previous observation can alert.
      const updated = await pg.oneOrNone<{ id: string }>(
        `update contracts c
        set data = c.data || jsonb_build_object('sportsF1Watch',$7::jsonb) ||
          case when $8 and nullif(trim(c.data->>'sportsAttentionReason'),'') is null then
            jsonb_build_object('sportsAttentionReason','F1 classification changed after settlement',
            'sportsAttentionSince',$9::bigint) else '{}'::jsonb end
        where ${isWatched} and c.id=$2 and c.data->'sportsF1Watch'=$5::jsonb
          and exists (select 1 from sports_competition_switches s where
          s.competition_id || ':' || s.phase = $6 and s.enabled)
        returning c.id`,
        [
          MANIFOLD_SPORTS_USER_IDS,
          id,
          ...dates(now),
          watch,
          watch.phase,
          next,
          changed,
          now,
        ]
      )
      if (!updated) continue
      result.checked++
      if (!accepted) result.unavailable++
      if (changed) {
        result.corrections++
        log.error(
          '[sports-bdl-watch] F1 classification changed after settlement',
          { contractId: id, sessionId: ids.sessionId }
        )
        if (watch.correctedTime === undefined && isProd()) {
          const sent = await sendTextEmail(
            'info@manifold.markets',
            'F1 classification changed after settlement',
            `Market ${id}; F1 session ${ids.sessionId}. Review the provider classification and original settlement in https://${DOMAIN}/admin/sports.`
          )
          if (!sent)
            log.error('[sports-bdl-watch] F1 correction email failed', {
              contractId: id,
            })
        }
      }
    } catch {
      log.warn('[sports-bdl-watch] F1 classification could not be checked', {
        contractId: id,
      })
      result.unavailable++
    }
  }
  return result
}
