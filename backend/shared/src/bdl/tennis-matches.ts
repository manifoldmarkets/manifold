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
  is_live: z.unknown(),
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
function validTiebreak(set: RawSet, target: number | null) {
  const {
    player1_games: a,
    player2_games: b,
    player1_tiebreak: x,
    player2_tiebreak: y,
  } = set
  if (target === null && Math.min(a, b) === 6) return false
  if (x == null && y == null) return true
  // A historical deciding-set format must be known before interpreting its points.
  if (target === null || Math.min(a, b) !== 6 || Math.max(a, b) > 7)
    return false
  if (a === b)
    return (
      x == null || y == null || Math.max(x, y) < target || Math.abs(x - y) < 2
    )
  const win = a > b ? x : y,
    lose = a > b ? y : x
  if (win == null) return true // A lone losing total does not determine the winning total.
  if (win < target) return false
  if (lose == null) return true
  return win === target ? lose <= target - 2 : win - lose === 2
}
// Source slot order remains unchanged here. Ranking can reorder whole sides after binding scores.
function scoreLine(
  raw: unknown,
  bestOf: 3 | 5,
  final: boolean,
  decidingTarget: number | null
) {
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
    if (!validTiebreak(s, i + 1 === bestOf ? decidingTarget : 7)) return null
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
  const reportedState = state(m.match_status, m.status_state)
  const liveConflict =
    m.is_live != null && m.is_live !== (reportedState.status === 'live')
  const prematureWinner =
    (reportedState.status === 'scheduled' ||
      reportedState.status === 'live' ||
      reportedState.status === 'suspended') &&
    m.winner != null
  const scheduledPlay =
    reportedState.status === 'scheduled' &&
    ((m.set_scores != null &&
      (!Array.isArray(m.set_scores) || m.set_scores.length > 0)) ||
      m.player1_game_score != null ||
      m.player2_game_score != null ||
      m.server != null)
  const contradiction = liveConflict || prematureWinner || scheduledPlay
  const status = contradiction ? 'unavailable' : reportedState.status
  let attention = reportedState.attention ?? (contradiction ? 'status' : null)
  const scoreBearing =
    status === 'live' || status === 'final' || status === 'suspended'
  // The four majors unified their final-set format in 2022, starting at Roland-Garros.
  // Hold historical deciding tiebreaks until their tournament-specific rule is known.
  const decidingTarget = slam ? (t.season >= 2023 ? 10 : null) : 7
  const evidence = scoreBearing
    ? scoreLine(m.set_scores, bestOf, status === 'final', decidingTarget)
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
  const target = last?.set_number === bestOf ? decidingTarget : 7
  const ongoingPoints =
    !inTiebreak ||
    (target !== null &&
      (Math.max(Number(points[0]), Number(points[1])) < target ||
        Math.abs(Number(points[0]) - Number(points[1])) < 2))
  const validPoints =
    ongoingPoints &&
    points.every((v) => v !== null) &&
    (points[0] !== 'AD' || points[1] === '40') &&
    (points[1] !== 'AD' || points[0] === '40')
  const current = status === 'live' && !attention
  const bind = (p: z.infer<typeof player>, i: 0 | 1): TennisSide => ({
    id: p.id,
    name: p.full_name,
    sets: sets.map((s: RawSet) =>
      i === 0
        ? { games: s.player1_games, tiebreak: s.player1_tiebreak ?? null }
        : { games: s.player2_games, tiebreak: s.player2_tiebreak ?? null }
    ),
    points: current && validPoints ? points[i] : null,
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
