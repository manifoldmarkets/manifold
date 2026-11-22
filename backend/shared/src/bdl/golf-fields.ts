import { z } from 'zod'
import {
  GolfField,
  GolfPlayer,
  GolfTour,
  GolfTournament,
  golfRank,
  golfThrough,
  isOfficialGolfTournament,
  isListedPgaTournament,
} from 'common/bdl/golf'
import { bdlEventId } from 'common/sports-ids'
import { isSportsBdlEnabled } from 'common/bdl/rollout'
import { createBdlClient } from '../balldontlie-client'

const id = z.number().int().positive().safe()
const label = z
  .string()
  .trim()
  .min(1)
  .max(180)
  .transform((s) => s.replace(/\s+/gu, ' '))
const text = z
  .string()
  .trim()
  .nullish()
  .transform((s) => s || null)
const number = z
  .number()
  .int()
  .safe()
  .nullish()
  .transform((n) => n ?? null)
const round = id.max(12)
const calendar = z.object({
  id,
  season: id.max(9999),
  name: label,
  start_date: text,
  end_date: text,
  status: text,
})
const pgaCalendar = calendar.extend({
  status_state: text,
  format_type: text,
  course_name: text,
  rounds: z.array(
    z.object({ round_number: round, status: text, status_state: text })
  ),
})
const lpgaCalendar = calendar.extend({
  format: text,
  course: text,
  current_round: round.nullish(),
})
const day = (v: string | null) => {
  if (!v || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(v)) return null
  const ms = Date.parse(v + 'T00:00:00Z')
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === v
    ? v
    : null
}
export function parseGolfTournament(
  tour: GolfTour,
  raw: unknown
): GolfTournament | null {
  if (tour !== 'pga' && tour !== 'lpga') return null
  const c = calendar.safeParse(raw)
  if (!c.success) return null
  const { id, season, name } = c.data
  const base = {
    tour,
    id,
    season,
    name,
    eventId: bdlEventId(tour, id),
    startDate: day(c.data.start_date),
    endDate: day(c.data.end_date),
  }
  if (tour === 'lpga') {
    const s = lpgaCalendar.safeParse(raw)
    if (!s.success) return null
    const t = s.data
    const state =
      t.status === 'in_progress'
        ? 'live'
        : t.status === 'final'
        ? 'final'
        : t.status === 'scheduled'
        ? 'scheduled'
        : t.status === 'suspended'
        ? 'suspended'
        : 'unavailable'
    return {
      ...base,
      format: t.format,
      course: t.course,
      state,
      round: t.current_round ?? null,
    }
  }
  const s = pgaCalendar.safeParse(raw)
  if (!s.success) return null
  const t = s.data
  const rounds = t.rounds
    .slice()
    .sort((a, b) => a.round_number - b.round_number)
  const roundStates: Record<string, string> = {
    OFFICIAL: 'final',
    IN_PROGRESS: 'in_progress',
    SUSPENDED: 'suspended',
    NOT_STARTED: 'scheduled',
    SCHEDULED: 'scheduled',
  }
  const coherent =
    new Set(rounds.map((r) => r.round_number)).size === rounds.length &&
    rounds.every(
      (r) =>
        r.status !== null &&
        r.status_state !== null &&
        roundStates[r.status] === r.status_state
    )
  const underway = rounds.filter(
    (r) => r.status === 'IN_PROGRESS' || r.status === 'SUSPENDED'
  )
  const current = coherent && underway.length === 1 ? underway[0] : undefined
  let state: GolfTournament['state'] = 'unavailable'
  if (coherent && current?.status === 'SUSPENDED') state = 'suspended'
  else if (
    coherent &&
    t.status === 'COMPLETED' &&
    t.status_state === 'final' &&
    rounds.length &&
    rounds.every((r) => r.status === 'OFFICIAL' && r.status_state === 'final')
  )
    state = 'final'
  else if (
    coherent &&
    t.status === 'IN_PROGRESS' &&
    t.status_state === 'in_progress' &&
    underway.length <= 1
  )
    state = 'live'
  else if (
    coherent &&
    !underway.length &&
    (t.status === 'NOT_STARTED' || t.status === 'SCHEDULED') &&
    t.status_state === 'scheduled'
  )
    state = 'scheduled'
  return {
    ...base,
    format: t.format_type,
    course: t.course_name,
    state,
    round: current?.round_number ?? null,
  }
}

const competitor = z.object({
  id,
  type: z.literal('PLAYER'),
  player: z.object({ id, display_name: label }),
})
const rosterRow = competitor.extend({ tournament_id: id })
const resultRow = z.object({
  id,
  tournament: z.object({ id }),
  competitor,
  position: text,
  position_numeric: number,
  status: text,
  scoring: z.object({ to_par: number, strokes: number }),
  thru: text,
})
const entryRow = z.object({
  id,
  tournament_id: id,
  players: z.array(z.object({ id, name: label })).length(1),
  field_present: z.boolean().nullish(),
  position: text,
  status: text,
  to_par: number,
  strokes: number,
  thru: text,
})
const compactName = (s: string) => s.normalize('NFC').toLowerCase()
function playerState(
  status: string | null,
  position: string | null,
  pga = false
): GolfPlayer['state'] {
  const tags = [status, position].map((v) => v?.toUpperCase())
  if (tags.some((s) => s === 'DQ' || s === 'DISQUALIFIED'))
    return 'disqualified'
  if (tags.some((s) => s === 'WD' || s === 'WDC' || s === 'WITHDRAWN'))
    return 'withdrawn'
  if (tags.some((s) => s === 'CUT' || s === 'MC')) return 'cut'
  if (
    status?.toLowerCase() === 'active' ||
    (pga && golfRank(position) && (!status || golfRank(status)))
  )
    return 'active'
  return 'unknown'
}
function scores(
  position: string | null,
  status: GolfPlayer['state'],
  toPar: number | null,
  strokes: number | null,
  through: string | null,
  fieldPresent: boolean | null
) {
  if (status !== 'active' || fieldPresent === false)
    return { position: null, toPar: null, through: null }
  return {
    position: golfRank(position),
    toPar: strokes !== null && strokes > 0 ? toPar : null,
    through: golfThrough(through),
  }
}
export function projectGolfField(
  tournament: GolfTournament,
  roster: readonly unknown[],
  results: readonly unknown[],
  readStartedAt: number
): GolfField {
  if (!Number.isSafeInteger(readStartedAt) || readStartedAt < 0)
    throw Error('Invalid golf observation time')
  const players = new Map<number, GolfPlayer>(),
    competitors = new Map<number, number>()
  const pending = new Set<number>(),
    rejected = new Set<number>()
  const playersWithResults = new Set<number>()
  const resultOwners = new Map<number, number>()
  let incomplete = false
  // A repeated or contradictory identity cannot produce a named quote or leaderboard row.
  function add(p: GolfPlayer, fromResults: boolean) {
    const old = players.get(p.playerId),
      other = competitors.get(p.competitorId)
    if (
      (old &&
        (!fromResults ||
          !pending.has(p.playerId) ||
          old.competitorId !== p.competitorId ||
          compactName(old.name) !== compactName(p.name))) ||
      (other !== undefined && other !== p.playerId)
    ) {
      rejected.add(p.playerId)
      if (other !== undefined) rejected.add(other)
      incomplete = true
      return
    }
    competitors.set(p.competitorId, p.playerId)
    players.set(p.playerId, p)
    if (fromResults) {
      pending.delete(p.playerId)
      playersWithResults.add(p.playerId)
    } else pending.add(p.playerId)
  }
  if (tournament.tour === 'pga') {
    for (const raw of roster) {
      const r = rosterRow.safeParse(raw)
      if (!r.success || r.data.tournament_id !== tournament.id) {
        incomplete = true
        continue
      }
      const { id, player } = r.data
      add(
        {
          playerId: player.id,
          competitorId: id,
          name: player.display_name,
          state: tournament.state === 'scheduled' ? 'entered' : 'unknown',
          fieldPresent: null,
          position: null,
          toPar: null,
          through: null,
        },
        false
      )
    }
    for (const raw of results) {
      const r = resultRow.safeParse(raw)
      if (!r.success || r.data.tournament.id !== tournament.id) {
        incomplete = true
        continue
      }
      const {
        competitor: c,
        position,
        position_numeric,
        status,
        scoring,
        thru,
      } = r.data
      const previous = resultOwners.get(r.data.id)
      if (previous !== undefined && previous !== c.player.id) {
        rejected.add(previous)
        rejected.add(c.player.id)
        incomplete = true
        continue
      }
      resultOwners.set(r.data.id, c.player.id)
      const statusRank = golfRank(status)
      const state = playerState(status, position, true),
        rank = golfRank(position)
      if (
        (position_numeric !== null && position_numeric !== rank?.rank) ||
        (statusRank &&
          rank &&
          (statusRank.rank !== rank.rank || statusRank.tied !== rank.tied))
      ) {
        incomplete = true
        rejected.add(c.player.id)
        continue
      }
      add(
        {
          playerId: c.player.id,
          competitorId: c.id,
          name: c.player.display_name,
          state,
          fieldPresent: null,
          ...scores(
            position,
            state,
            scoring.to_par,
            scoring.strokes,
            thru,
            null
          ),
        },
        true
      )
    }
  } else {
    for (const raw of results) {
      const r = entryRow.safeParse(raw)
      if (!r.success || r.data.tournament_id !== tournament.id) {
        incomplete = true
        continue
      }
      const v = r.data,
        p = v.players[0],
        state = playerState(v.status, v.position),
        present = v.field_present ?? null
      add(
        {
          playerId: p.id,
          competitorId: v.id,
          name: p.name,
          state,
          fieldPresent: present,
          ...scores(v.position, state, v.to_par, v.strokes, v.thru, present),
        },
        true
      )
    }
  }
  for (const id of rejected) {
    players.delete(id)
    playersWithResults.delete(id)
  }
  return {
    tournament,
    readStartedAt,
    incomplete,
    hasResults: playersWithResults.size > 0,
    players: [...players.values()].sort(
      (a, b) =>
        (a.position?.rank ?? Infinity) - (b.position?.rank ?? Infinity) ||
        a.name.localeCompare(b.name) ||
        a.playerId - b.playerId
    ),
  }
}

type Client = Pick<ReturnType<typeof createBdlClient>, 'getAll'>
/** No scheduled job. Callers must identify an existing market's tournament and recheck its switch. */
export async function readGolfField(
  client: Client,
  tour: GolfTour,
  tournamentId: number,
  season: number,
  enabled: () => Promise<boolean> | boolean,
  now = Date.now
) {
  if (tour !== 'pga' && tour !== 'lpga') return null
  const on = () => isSportsBdlEnabled() && enabled()
  const disabled = new Error('Golf field phase disabled')
  const beforeRequest = async () => {
    if (!(await on())) throw disabled
  }
  if (!(await on())) return null
  if (
    tour === 'lpga' &&
    (!process.env.BDL_FIXTURE_DIR ||
      process.env.LOCAL_ONLY !== 'true' ||
      process.env.GOOGLE_CLOUD_PROJECT != null)
  )
    return null
  const seen = now()
  if (
    !id.safeParse(tournamentId).success ||
    !id.min(1000).max(9999).safeParse(season).success
  )
    throw Error('Invalid golf tournament scope')
  if (tour === 'pga' && !isListedPgaTournament(season, tournamentId))
    return null
  // Never use a caller's transport for the disabled LPGA circuit. Only an
  // explicitly local fixture transport can exercise its two read endpoints.
  const reader = tour === 'lpga' ? createBdlClient({ role: 'codex' }) : client
  const expected = calendar.pick({ id: true, season: true })
  const read = (
    path: string,
    params: Parameters<Client['getAll']>[1],
    maxPages: number,
    matches: (row: unknown) => boolean
  ) =>
    reader
      .getAll<unknown>(path, params, { maxPages, matches, beforeRequest })
      .catch((error) => {
        if (error === disabled) return null
        throw error
      })
  const calendars = await read(
    tour === 'pga' ? '/pga/v2/tournaments' : '/lpga/v1/tournaments',
    {
      tournament_ids: [tournamentId],
      season,
      ...(tour === 'pga' ? { include_format: 'true' } : {}),
    },
    1,
    (row) => {
      const parsed = expected.safeParse(row)
      return (
        parsed.success &&
        parsed.data.id === tournamentId &&
        parsed.data.season === season
      )
    }
  )
  const t =
    calendars?.length === 1 ? parseGolfTournament(tour, calendars[0]) : null
  if (!t || !(await on())) return null
  const matchRoster = z.object({ tournament_id: z.literal(tournamentId) })
  if (tour === 'lpga') {
    const entries = await read(
      '/lpga/v1/entries',
      { tournament_id: tournamentId },
      4,
      (row) => matchRoster.safeParse(row).success
    )
    return entries && (await on())
      ? projectGolfField(t, [], entries, seen)
      : null
  }
  if (!isOfficialGolfTournament(t)) return null
  const roster = await read(
    '/pga/v2/tournament_competitors',
    { tournament_id: tournamentId },
    4,
    (row) => matchRoster.safeParse(row).success
  )
  if (!roster || !(await on())) return null
  const matchResult = z.object({
    tournament: z.object({ id: z.literal(tournamentId) }),
  })
  const results =
    t.state === 'scheduled'
      ? []
      : await read(
          '/pga/v2/tournament_results',
          { tournament_id: tournamentId },
          4,
          (row) => matchResult.safeParse(row).success
        )
  return results && (await on())
    ? projectGolfField(t, roster, results, seen)
    : null
}
