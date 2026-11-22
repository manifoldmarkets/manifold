import { z } from 'zod'
import {
  TennisMatch,
  TennisRound,
  TennisSide,
  TennisTour,
} from 'common/bdl/tennis'
import { tennisTiming, tennisVenueZone } from 'common/bdl/tennis-time'
import { bdlHeadToHeadEventId } from 'common/sports-ids'

const id = z.number().int().positive().safe()
const label = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .transform((name) => name.replace(/\s+/gu, ' '))
const player = z.object({ id, full_name: label })
const mainDraw = z.object({
  id,
  season: id,
  name: label,
  location: label,
  category: label,
  start_date: z.string().nullish(),
  end_date: z.string().nullish(),
})
const match = z.object({
  id,
  season: id,
  tournament: mainDraw,
  round: z.string().nullish(),
  scheduled_time: z.string().nullish(),
  player1: player,
  player2: player,
  winner: z.unknown(),
  match_status: z.string().nullish(),
  status_state: z.string().nullish(),
  set_scores: z.unknown(),
  player1_game_score: z.unknown(),
  player2_game_score: z.unknown(),
  server: z.unknown(),
})
const games = z.number().int().min(0).max(7)
const tb = z.number().int().nonnegative().safe().nullish()
const setsSchema = z
  .array(
    z.object({
      set_number: id,
      player1_games: games,
      player2_games: games,
      player1_tiebreak: tb,
      player2_tiebreak: tb,
    })
  )
  .max(5)
type RawSet = z.infer<typeof setsSchema>[number]
const rounds: Record<string, TennisRound> = {
  'round of 32': 'R32',
  'round of 16': 'R16',
  quarterfinal: 'QF',
  quarterfinals: 'QF',
  semifinal: 'SF',
  semifinals: 'SF',
  final: 'F',
  finals: 'F',
  qf: 'QF',
  sf: 'SF',
  f: 'F',
}
// Women's Slam M3 and M4 are rounds of 32 and 16. Lettered late-round codes are tour-specific.
const wtaRounds: Record<string, TennisRound> = { MQ: 'QF', MS: 'SF', MF: 'F' }
const getRound = (
  tour: TennisTour,
  raw: string,
  slam: boolean
): TennisRound | null => {
  if (tour === 'wta') {
    if (slam && (raw === 'M3' || raw === 'M4'))
      return raw === 'M3' ? 'R32' : 'R16'
    if (Object.prototype.hasOwnProperty.call(wtaRounds, raw))
      return wtaRounds[raw]
  }
  const key = raw.trim().toLowerCase().replace(/-/g, '')
  return Object.prototype.hasOwnProperty.call(rounds, key) ? rounds[key] : null
}
function state(
  raw: string | null | undefined,
  phase: string | null | undefined
): Pick<TennisMatch, 'status' | 'attention'> {
  if (raw === 'walkover' || raw === 'retired' || raw === 'defaulted')
    return { status: 'unavailable', attention: raw }
  if (raw === 'finished' && phase === 'final')
    return { status: 'final', attention: null }
  if (raw === 'in_progress' && phase === 'in_progress')
    return { status: 'live', attention: null }
  if (raw === 'scheduled' && phase === 'scheduled')
    return { status: 'scheduled', attention: null }
  if (raw === 'suspended' && phase === 'suspended')
    return { status: 'suspended', attention: null }
  if (raw === 'canceled' && phase === 'canceled')
    return { status: 'canceled', attention: null }
  return { status: 'unavailable', attention: 'status' }
}
function completed(a: number, b: number) {
  return (
    (Math.max(a, b) === 6 && Math.min(a, b) <= 4) ||
    (Math.max(a, b) === 7 && Math.min(a, b) >= 5 && Math.min(a, b) <= 6)
  )
}
// Source slot order remains unchanged here. Ranking can reorder whole sides after binding scores.
function scoreLine(raw: unknown, bestOf: 3 | 5, final: boolean) {
  const parsed = setsSchema.safeParse(raw)
  if (!parsed.success || parsed.data.length > bestOf) return null
  const wins = [0, 0],
    needed = (bestOf + 1) / 2
  for (const [i, s] of parsed.data.entries()) {
    const a = s.player1_games,
      b = s.player2_games
    if (s.set_number !== i + 1 || wins.some((n) => n >= needed)) return null
    const done = completed(a, b)
    if (!done && (final || i !== parsed.data.length - 1 || Math.max(a, b) > 6))
      return null
    const x = s.player1_tiebreak,
      y = s.player2_tiebreak
    if (x != null || y != null) {
      if (!(Math.min(a, b) === 6 && Math.max(a, b) <= 7)) return null
      if (
        done &&
        x != null &&
        y != null &&
        (a > b !== x > y || Math.max(x, y) < 7 || Math.abs(x - y) < 2)
      )
        return null
    }
    if (done) wins[a > b ? 0 : 1]++
  }
  const winner = wins.findIndex((v) => v === needed)
  if ((final && winner === -1) || (!final && winner !== -1)) return null
  return { sets: parsed.data, winner }
}
function point(value: unknown, tiebreak: boolean) {
  if (typeof value !== 'string') return null
  return (tiebreak ? /^(0|[1-9]\d{0,2})$/ : /^(0|15|30|40|AD)$/).test(value)
    ? value
    : null
}
export function parseTennisMatch(
  tour: TennisTour,
  raw: unknown,
  rankings?: ReadonlyMap<number, number>
): TennisMatch | null {
  const parsed = match.safeParse(raw)
  if (!parsed.success) return null
  const m = parsed.data,
    t = m.tournament
  if (
    m.season !== t.season ||
    m.player1.id === m.player2.id ||
    m.player1.full_name.toLowerCase() === m.player2.full_name.toLowerCase()
  )
    return null
  const slam = t.category === 'Grand Slam'
  const bestOf = tour === 'atp' && slam ? 5 : 3
  const rawRound = m.round?.trim() ?? ''
  const round = getRound(tour, rawRound, slam)
  const zone = tennisVenueZone(t.location)
  const timing = tennisTiming(m.scheduled_time, zone, bestOf)
  const dateOk = (value: string | null | undefined): value is string =>
    !!value &&
    /^[1-9]\d{3}-\d\d-\d\d$/.test(value) &&
    Number.isFinite(Date.parse(value + 'T00:00:00Z')) &&
    new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value
  const datedTournament =
    dateOk(t.start_date) && dateOk(t.end_date) && t.start_date <= t.end_date
  const insideDates =
    datedTournament &&
    (timing
      ? timing.venueDay >= t.start_date! && timing.venueDay <= t.end_date!
      : !m.scheduled_time)
  const masters = t.category === (tour === 'atp' ? 'Masters 1000' : 'WTA 1000')
  const eligibleRound =
    !!round &&
    insideDates &&
    (slam || (masters && ['QF', 'SF', 'F'].includes(round))) &&
    (tour !== 'wta' ||
      !!timing ||
      Object.prototype.hasOwnProperty.call(wtaRounds, rawRound) ||
      (slam && ['M3', 'M4'].includes(rawRound)))
  const { status, attention: statusIssue } = state(
    m.match_status,
    m.status_state
  )
  let attention = statusIssue
  const scoreBearing =
    status === 'live' || status === 'final' || status === 'suspended'
  const evidence = scoreBearing
    ? scoreLine(m.set_scores, bestOf, status === 'final')
    : null
  const ids = [m.player1.id, m.player2.id]
  const reported = z.object({ id }).safeParse(m.winner)
  const winnerId =
    status === 'final' &&
    evidence &&
    reported.success &&
    ids[evidence.winner] === reported.data.id
      ? reported.data.id
      : null
  if ((status === 'final' && winnerId === null) || (scoreBearing && !evidence))
    attention = 'scores'
  const sets = !attention && evidence ? evidence.sets : []
  const last = sets[sets.length - 1]
  const inTiebreak = last?.player1_games === 6 && last.player2_games === 6
  const points = [
    point(m.player1_game_score, inTiebreak),
    point(m.player2_game_score, inTiebreak),
  ]
  const current = status === 'live' && !attention
  const bind = (p: z.infer<typeof player>, i: 0 | 1): TennisSide => ({
    id: p.id,
    name: p.full_name,
    sets: sets.map((s: RawSet) =>
      i === 0
        ? { games: s.player1_games, tiebreak: s.player1_tiebreak ?? null }
        : { games: s.player2_games, tiebreak: s.player2_tiebreak ?? null }
    ),
    points: current && points.every((v) => v !== null) ? points[i] : null,
    serving: current && m.server === i + 1,
  })
  const sides: [TennisSide, TennisSide] = [
    bind(m.player1, 0),
    bind(m.player2, 1),
  ]
  const first = rankings?.get(ids[0]),
    second = rankings?.get(ids[1])
  if (
    first != null &&
    second != null &&
    Number.isSafeInteger(first) &&
    Number.isSafeInteger(second) &&
    first > 0 &&
    second > 0 &&
    second < first
  )
    sides.reverse()
  return {
    tour,
    id: m.id,
    eventId: bdlHeadToHeadEventId(tour, m.id, ids[0], ids[1]),
    tournament: { id: t.id, season: t.season, name: t.name },
    round,
    eligibleRound,
    bestOf,
    timing,
    sides,
    status,
    attention,
    winnerId,
  }
}
