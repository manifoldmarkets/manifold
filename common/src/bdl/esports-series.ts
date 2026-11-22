import { bdlEventId } from '../sports-ids'
import { parseSportsKickoffMs } from '../sports-kickoff-interface'
import { normalizeBdlStatus, type ProviderGameStatus } from '../sports-provider'

export type EsportsLeague = 'cs' | 'dota' | 'valorant' | 'lol'
export type EsportsRef = { id: number; name: string }
export type SeriesScores = { team1: number; team2: number }
export type EsportsSeries = {
  league: EsportsLeague
  id: number
  eventId: string
  tournament: EsportsRef | null
  tier: string | null
  stage: EsportsRef | null
  round: string | null
  team1: EsportsRef | null
  team2: EsportsRef | null
  bestOf: number | null
  startTimeMs: number | null
  status: ProviderGameStatus
  score: SeriesScores | null
  reportedWinnerId: number | null
  winnerId: number | null
  review:
    | 'entrants'
    | 'tournament'
    | 'format'
    | 'forfeit'
    | 'status'
    | 'score'
    | 'winner'
    | 'start'
    | null
  skipBestOfTwo: boolean
}

export function esportsRow(
  value: unknown
): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}
export const esportsId = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v > 0
export const esportsText = (v: unknown) =>
  typeof v === 'string' && v.trim() ? v.trim() : null
export function esportsRef(value: unknown): EsportsRef | null {
  const r = esportsRow(value)
  const name = esportsText(r?.name)
  return esportsId(r?.id) && name ? { id: r.id, name } : null
}
export function esportsScores(a: unknown, b: unknown): SeriesScores | null {
  return (a === 0 || esportsId(a)) && (b === 0 || esportsId(b))
    ? { team1: a, team2: b }
    : null
}
const nameKey = (name: string) =>
  name.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase()
function entrant(value: unknown) {
  const ref = esportsRef(value)
  return ref &&
    !/^(?:tbd|tba|unknown|to be (?:determined|announced)|(?:winner|loser) of\b.*)$/i.test(
      ref.name
    )
    ? ref
    : null
}
const isForfeit = (row: Record<string, unknown>) =>
  row.forfeit === true ||
  row.is_forfeit === true ||
  /\b(?:forfeit(?:ed|ure)?|walk[ -]?over|disqualified|defaulted|w\/o)\b/i.test(
    String(row.status ?? '').replace(/_/g, ' ')
  )

function outcome(
  row: Record<string, unknown>,
  game: Omit<EsportsSeries, 'review' | 'winnerId'>
): Pick<EsportsSeries, 'review' | 'winnerId'> {
  const hold = (review: EsportsSeries['review']) => ({ review, winnerId: null })
  if (isForfeit(row)) return hold('forfeit')
  if (
    !game.team1 ||
    !game.team2 ||
    game.team1.id === game.team2.id ||
    nameKey(game.team1.name) === nameKey(game.team2.name)
  )
    return hold('entrants')
  if (!game.tournament) return hold('tournament')
  if (game.skipBestOfTwo) return hold(null)
  if (!game.bestOf || ![1, 3, 5].includes(game.bestOf)) return hold('format')
  const { score, status, team1, team2, reportedWinnerId } = game
  const target = (game.bestOf + 1) / 2
  if (status === 'scheduled') {
    if (
      row.winner != null ||
      row.loser != null ||
      esportsId(row.team1_score) ||
      esportsId(row.team2_score)
    )
      return hold('status')
    if (game.startTimeMs === null) return hold('start')
    return hold(null)
  }
  if (status === 'in_progress') {
    if (
      row.winner != null ||
      row.loser != null ||
      (score && Math.max(score.team1, score.team2) >= target)
    )
      return hold('status')
    return hold(null)
  }
  if (
    status !== 'final' ||
    /^(?:upcoming|scheduled|current|live|in_progress)$/i.test(
      String(row.status)
    )
  )
    return hold('status')
  if (
    !score ||
    Math.max(score.team1, score.team2) !== target ||
    score.team1 === score.team2
  )
    return hold('score')
  const firstWins = score.team1 > score.team2
  const winningId = firstWins ? team1.id : team2.id
  const losingId = firstWins ? team2.id : team1.id
  if (
    reportedWinnerId !== winningId ||
    nameKey(esportsRef(row.winner)?.name ?? '') ===
      nameKey(firstWins ? team2.name : team1.name) ||
    (row.loser != null && esportsRow(row.loser)?.id !== losingId)
  )
    return hold('winner')
  return { winnerId: winningId, review: null }
}

export function readEsportsSeries(
  league: EsportsLeague,
  value: unknown
): EsportsSeries | null {
  const row = esportsRow(value)
  if (!row || !esportsId(row.id)) return null
  const t = esportsRow(row.tournament)
  const stage =
    league === 'cs' || league === 'valorant' ? esportsRef(row.stage) : null
  const format =
    league === 'cs'
      ? row.best_of ?? (stage ? esportsRow(row.stage)?.best_of : null)
      : league === 'valorant'
      ? null
      : row.bo_type
  const time =
    league === 'cs'
      ? row.start_time
      : league === 'valorant'
      ? row.start_at
      : row.start_date
  const start = parseSportsKickoffMs(
    typeof time === 'string' ? time : undefined
  )
  const winner = esportsRow(row.winner)?.id
  const game = {
    league,
    id: row.id,
    eventId: bdlEventId(league, row.id),
    tournament: esportsRef(t),
    tier: esportsText(t?.tier)?.toLowerCase() ?? null,
    stage,
    round: league === 'cs' && stage ? esportsText(row.round) : null,
    team1: entrant(row.team1),
    team2: entrant(row.team2),
    score: esportsScores(row.team1_score, row.team2_score),
    bestOf: esportsId(format) ? format : null,
    status: normalizeBdlStatus(row.status_state),
    startTimeMs: Number.isFinite(start) ? start : null,
    reportedWinnerId: esportsId(winner) ? winner : null,
    skipBestOfTwo: format === 2,
  }
  return { ...game, ...outcome(row, game) }
}

// LoL majors/regions and main VCT events need a verified title-specific ID list.
// A tournament name containing "VCT" also occurs in feeder qualifiers.
export function esportsTournamentScope(
  game: EsportsSeries,
  approved: Partial<Record<'lol' | 'valorant', ReadonlySet<number>>> = {}
): 'in-scope' | 'out-of-scope' | 'unverified' {
  if (!game.tournament) return 'unverified'
  if (game.league === 'cs' || game.league === 'dota') {
    if (game.tier === 's') return 'in-scope'
    return game.tier && /^[a-d]$/.test(game.tier)
      ? 'out-of-scope'
      : 'unverified'
  }
  return approved[game.league]?.has(game.tournament.id)
    ? 'in-scope'
    : 'unverified'
}

export type EsportsPage = {
  request: { path: string; params: Record<string, unknown> }
  status: number
  body: unknown
}
export function readEsportsPage(response: EsportsPage, path: string) {
  const body = esportsRow(response.body)
  if (
    response.status !== 200 ||
    response.request.path !== path ||
    !body ||
    !Array.isArray(body.data)
  )
    return null
  const meta = esportsRow(body.meta)
  if (body.meta != null && !meta) return null
  const cursor = meta?.next_cursor
  if (
    cursor != null &&
    typeof cursor !== 'string' &&
    !(esportsId(cursor) || cursor === 0)
  )
    return null
  return {
    rows: body.data as unknown[],
    nextCursor: cursor == null || cursor === '' ? null : String(cursor),
  }
}

export function readEsportsSeriesPage(
  league: EsportsLeague,
  response: EsportsPage
) {
  const page = readEsportsPage(response, '/' + league + '/v1/matches')
  if (!page) return null
  const p = response.request.params
  const ids = p['tournament_ids[]']
  const scalar = p.tournament_id
  if (
    ids != null &&
    (!Array.isArray(ids) || !ids.length || ids.some((id) => !isSelectorId(id)))
  )
    return null
  if (scalar != null && !isSelectorId(scalar)) return null
  // Some observed Dota and LoL selectors returned out-of-window series.
  // With an explicit UTC-day selector, only a confirmed start can match.
  const days = p['dates[]']
  if (
    days != null &&
    (!Array.isArray(days) ||
      !days.length ||
      days.some(
        (day) =>
          typeof day !== 'string' ||
          !Number.isFinite(parseSportsKickoffMs(day + 'T00:00:00Z'))
      ))
  )
    return null
  const wantedDays = Array.isArray(days) ? new Set<unknown>(days) : null
  const wanted = Array.isArray(ids) ? new Set(ids.map(String)) : null
  const games = new Map<number, EsportsSeries>()
  const conflicting = new Set<number>()
  let malformed = 0,
    outsideTournament = 0
  for (const raw of page.rows) {
    const series = readEsportsSeries(league, raw)
    if (!series) {
      malformed++
      continue
    }
    const previous = games.get(series.id)
    if (previous && JSON.stringify(previous) !== JSON.stringify(series))
      conflicting.add(series.id)
    else games.set(series.id, series)
  }
  const result: EsportsSeries[] = []
  let outsideDates = 0
  for (const series of games.values()) {
    if (conflicting.has(series.id)) continue
    const tid = String(series.tournament?.id)
    if (
      (wanted && !wanted.has(tid)) ||
      (scalar != null && String(scalar) !== tid)
    ) {
      outsideTournament++
      continue
    }
    if (
      wantedDays &&
      (series.startTimeMs === null ||
        !wantedDays.has(
          new Date(series.startTimeMs).toISOString().slice(0, 10)
        ))
    ) {
      outsideDates++
      continue
    }
    result.push(series)
  }
  return {
    series: result,
    conflictingIds: [...conflicting],
    malformed,
    outsideTournament,
    outsideDates,
    nextCursor: page.nextCursor,
  }
}
function isSelectorId(v: unknown) {
  return (
    esportsId(v) ||
    (typeof v === 'string' && esportsId(Number(v)) && String(Number(v)) === v)
  )
}
