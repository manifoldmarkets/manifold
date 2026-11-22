import { isSportsBdlEnabled } from 'common/bdl/rollout'
import {
  autoCreates,
  getSportsCalendar,
  type CompetitionSwitches,
  type SportsCalendarEntry,
} from 'common/sports-calendar'
import type { SupabaseDirectClient } from '../supabase/init'
import { getCompetitionSwitches } from '../supabase/sports-competition-switches'
import { log } from '../utils'
import type { ClassificationSample } from './classification-health'
import { calendarLeague } from './calendar-league'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
// Retention bounds inactive monitoring state, independently of the alert thresholds.
const RETENTION = 30 * DAY
type Incident = {
  kind: 'classification_empty' | 'calendar_expiry'
  league: string
  subject: string
  scope: string
  end: string | null
  bad: boolean
  startedAt: number
  at: number
}
export function calendarSamples(
  entries: SportsCalendarEntry[],
  switches: CompetitionSwitches,
  now: number
): Incident[] {
  const leagues = new Map<string, { enabled: boolean; end: string }>()
  for (const entry of entries) {
    if (entry.locked || !(entry.provider || entry.oddsKey)) continue
    const key =
      entry.bdlLeagueKey ??
      (entry.provider === 'bdl-f1'
        ? 'f1'
        : calendarLeague(entry) ?? entry.oddsKey)
    if (!key) continue
    const seen = leagues.get(key)
    leagues.set(key, {
      enabled: !!seen?.enabled || autoCreates(entry, switches),
      end: seen && seen.end > entry.endDate ? seen.end : entry.endDate,
    })
  }
  return Array.from(leagues)
    .filter(([, value]) => value.enabled)
    .map(([league, { end }]) => ({
      kind: 'calendar_expiry' as const,
      league,
      subject: 'calendar',
      scope: league,
      end,
      bad: now >= Date.parse(end + 'T23:59:59Z') - 30 * DAY,
      startedAt: now,
      at: now,
    }))
}
type State = {
  first_seen_at: string | null
  opened_at: string | null
  last_observed_at: string
}
type Notice = { open: boolean; message: string }

async function apply(
  pg: SupabaseDirectClient,
  input: Incident
): Promise<Notice | undefined> {
  const key = [input.kind, input.league, input.subject]
  const previous = await pg.oneOrNone<State>(
    `select first_seen_at, opened_at, last_observed_at from sports_provider_incidents
      where kind = $1 and league_key = $2 and subject = $3`,
    key
  )
  // A read that started before the last accepted observation cannot confirm
  // either a new incident or recovery. The provider supplies no revision.
  if (
    previous &&
    (input.at <= new Date(previous.last_observed_at).getTime() ||
      input.startedAt < new Date(previous.last_observed_at).getTime())
  )
    return
  const first = input.bad ? new Date(previous?.first_seen_at ?? input.at) : null
  const open =
    first &&
    (input.kind === 'calendar_expiry' || input.startedAt - +first >= 2 * HOUR)
      ? new Date(previous?.opened_at ?? input.at)
      : null
  await pg.none(
    `insert into sports_provider_incidents
    (kind,league_key,subject,provider,scope_key,calendar_end,first_seen_at,opened_at,last_observed_at)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    on conflict (kind,league_key,subject) do update set scope_key=excluded.scope_key,
      calendar_end=excluded.calendar_end, first_seen_at=excluded.first_seen_at,
      opened_at=excluded.opened_at, last_observed_at=excluded.last_observed_at`,
    [
      ...key,
      input.kind === 'classification_empty' ? 'bdl' : null,
      input.scope,
      input.end,
      first,
      open,
      new Date(input.at),
    ]
  )
  if (!!open === !!previous?.opened_at) return
  const message =
    input.kind === 'calendar_expiry' && !open
      ? `${input.league} has a maintained calendar through ${input.end} UTC.`
      : input.kind === 'calendar_expiry'
      ? `${input.league} calendar ends ${input.end} UTC. Check the next season dates and the phase switches in /admin/sports.`
      : `F1 final session ${input.subject} (${input.scope}): ${
          open
            ? `classification returned empty on recheck at least two hours after ${first?.toISOString()}. Check /session_results and the affected markets in /admin/sports.`
            : 'a validated classification is now available.'
        }`
  return { open: !!open, message }
}

/** A single brief database transaction after provider/settlement work. The
 * transaction lock only serializes health writers, never market or provider work. */
export async function recordSportsHealth(
  pg: SupabaseDirectClient,
  classifications: readonly ClassificationSample[] = [],
  calendar = false
) {
  if (!isSportsBdlEnabled() || (!calendar && !classifications.length)) return
  const notices = await pg.tx(async (tx) => {
    await tx.one(
      `select pg_advisory_xact_lock(hashtext('sports-provider-health-v1'))`
    )
    const switches = await getCompetitionSwitches(tx)
    const now = Date.now()
    const entries = getSportsCalendar()
    const enabledF1 = entries
      .filter((e) => e.provider === 'bdl-f1' && autoCreates(e, switches))
      .map((e) => e.competitionId)
    const emitted: Notice[] = []
    if (calendar) {
      const samples = calendarSamples(entries, switches, now)
      // Retire removed/disabled scopes and aged observations. Retirement is
      // distinct from seeing a healthy provider response.
      await tx.none(
        `delete from sports_provider_incidents where
        (kind='calendar_expiry' and not (league_key = any($1::text[]))) or
        (kind='classification_empty' and
           (not (scope_key = any($2::text[])) or last_observed_at < $3))`,
        [samples.map((s) => s.league), enabledF1, new Date(now - RETENTION)]
      )
      for (const sample of samples) {
        const notice = await apply(tx, sample)
        if (notice) emitted.push(notice)
      }
    }
    for (const s of classifications) {
      if (
        !enabledF1.includes(s.competitionId) ||
        s.startedAt < now - RETENTION ||
        s.observedAt < s.startedAt ||
        s.observedAt > now
      )
        continue
      const notice = await apply(tx, {
        kind: 'classification_empty',
        league: 'f1',
        subject: String(s.sessionId),
        scope: s.competitionId,
        end: null,
        bad: s.empty,
        startedAt: s.startedAt,
        at: s.observedAt,
      })
      if (notice) emitted.push(notice)
    }
    return emitted
  })
  for (const notice of notices) {
    const message = `[sports-provider-health] ${
      notice.open ? 'OPEN' : 'CLEARED'
    } ${notice.message}`
    if (notice.open) log.error(message)
    else log(message)
  }
}
