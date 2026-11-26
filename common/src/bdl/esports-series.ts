import type {
  EsportsGame,
  EsportsSeriesFacts,
  EsportsStageMeta,
  EsportsTeamRef,
} from '../esports/types'
import { bdlEventId } from '../sports-ids'
import { parseSportsKickoffMs } from '../sports-kickoff-interface'
import { normalizeBdlStatus } from '../sports-provider'

/** Why a series' result or pairing is held back. Null means nothing is held. */
export type EsportsReview =
  | 'entrants'
  | 'format'
  | 'forfeit'
  | 'status'
  | 'score'
  | 'winner'
  | 'start'

type Row = Record<string, unknown>
type Outcome = { winnerId: number | null; review: EsportsReview | null }

const asRow = (v: unknown): Row | undefined =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Row)
    : undefined
const isId = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v > 0
const isCount = (v: unknown): v is number => v === 0 || isId(v)
const text = (v: unknown) =>
  typeof v === 'string' && v.trim() ? v.trim() : null
const nameKey = (name: string) =>
  name.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase()

/** The market identity of a series: `bdl:<game>:<id>`. Throws on a bad ID. */
export const esportsEventId = (s: Pick<EsportsSeriesFacts, 'game' | 'id'>) =>
  bdlEventId(s.game, s.id)

// A placeholder entrant ("TBD", "Winner of …") is not a team. The test runs on
// the normalized name, so full-width letters and odd spacing don't slip past.
function readTeam(game: EsportsGame, value: unknown): EsportsTeamRef | null {
  const r = asRow(value)
  const name = text(r?.name)
  if (
    !r ||
    !isId(r.id) ||
    !name ||
    /^(?:tbd|tba|unknown|to be (?:determined|announced)|(?:winner|loser) of\b.*)$/i.test(
      nameKey(name)
    )
  )
    return null
  return {
    id: r.id,
    name,
    code: text(game === 'cs' ? r.short_name : r.acronym),
  }
}

// Only CS2 and Valorant send a stage. Dota's is always empty; LoL has none.
function readStage(game: EsportsGame, value: unknown) {
  const r = asRow(value)
  const name = text(r?.name)
  if ((game !== 'cs' && game !== 'valorant') || !r || !isId(r.id) || !name)
    return null
  if (game === 'valorant') return { id: r.id, name }
  return {
    id: r.id,
    name,
    type: text(r.stage_type)?.toLowerCase() ?? null,
    order: isCount(r.stage_order) ? r.stage_order : null,
    roundsCount: isId(r.rounds_count) ? r.rounds_count : null,
  }
}

const isForfeit = (row: Row) =>
  row.forfeit === true ||
  row.is_forfeit === true ||
  text(row.status)?.toLowerCase() === 'defwin' ||
  /\b(?:forfeit(?:ed|ure)?|walk[ -]?over|disqualified|defaulted|w\/o)\b/i.test(
    String(row.status ?? '').replace(/_/g, ' ')
  )

// A reported winner or loser is that entrant only by both its ID and its name.
const isSameTeam = (value: unknown, team: EsportsTeamRef) => {
  const r = asRow(value)
  const name = text(r?.name)
  return r?.id === team.id && !!name && nameKey(name) === nameKey(team.name)
}

// A winner counts only when the entrants, format, status, score and reported
// winner all agree. Anything else is held with the first reason that applies.
//
// Each state is trusted only with the provider's own word for it, the same
// in all four games' recordings: `upcoming` when scheduled, `current` when in
// progress and `finished` when final. (No live LoL row was recorded, so its
// `current` is assumed.) Any other word with that state, or none, is held as
// 'status': canceled, postponed, a word we haven't seen.
function outcome(
  row: Row,
  s: Omit<EsportsSeriesFacts, 'winnerId' | 'review'>
): Outcome {
  const hold = (review: EsportsReview | null) => ({ review, winnerId: null })
  if (isForfeit(row)) return hold('forfeit')
  const { team1, team2, score, status, bestOf } = s
  if (
    !team1 ||
    !team2 ||
    team1.id === team2.id ||
    nameKey(team1.name) === nameKey(team2.name)
  )
    return hold('entrants')
  // A best of 2 can end level, so it never has a two-sided result.
  if (bestOf === 2) return hold(null)
  if (!bestOf || ![1, 3, 5].includes(bestOf)) return hold('format')
  const target = (bestOf + 1) / 2
  const rawStatus = s.rawStatus?.toLowerCase()
  const sent = [row.team1_score, row.team2_score]
  const named = row.winner != null || row.loser != null
  if (status !== 'final') {
    // A score that was sent but isn't a whole number from zero up. The two
    // sides are checked one by one: `score` is null unless both are valid.
    if (sent.some((v) => v != null && !isCount(v))) return hold('score')
    if (status === 'scheduled') {
      if (rawStatus !== 'upcoming' || named || sent.some(isId))
        return hold('status')
      return hold(s.startTimeMs === null ? 'start' : null)
    }
    // Live, yet one side has already reached the winning score.
    return hold(
      rawStatus !== 'current' ||
        named ||
        sent.some((v) => isId(v) && v >= target)
        ? 'status'
        : null
    )
  }
  if (rawStatus !== 'finished') return hold('status')
  if (
    !score ||
    Math.max(score.team1, score.team2) !== target ||
    score.team1 === score.team2
  )
    return hold('score')
  const [won, lost] =
    score.team1 > score.team2 ? [team1, team2] : [team2, team1]
  if (
    !isSameTeam(row.winner, won) ||
    (row.loser != null && !isSameTeam(row.loser, lost))
  )
    return hold('winner')
  return { winnerId: won.id, review: null }
}

/**
 * One provider match as series facts. Returns null when the row can't be a
 * series in a tournament view: no valid ID or tournament, or a status other
 * than scheduled, in progress or final (canceled, postponed, unknown).
 */
export function readEsportsSeries(
  game: EsportsGame,
  value: unknown,
  observedAtMs: number | null = null
): EsportsSeriesFacts | null {
  const row = asRow(value)
  const t = asRow(row?.tournament)
  const tournamentName = text(t?.name)
  const status = normalizeBdlStatus(row?.status_state)
  if (!row || !isId(row.id) || !t || !isId(t.id) || !tournamentName) return null
  if (status !== 'scheduled' && status !== 'in_progress' && status !== 'final')
    return null
  const stage = readStage(game, row.stage)
  const format =
    game === 'cs'
      ? row.best_of ?? (stage ? asRow(row.stage)?.best_of : null)
      : game === 'valorant'
      ? null
      : row.bo_type
  const time =
    game === 'cs'
      ? row.start_time
      : game === 'valorant'
      ? row.start_at
      : row.start_date
  const start = parseSportsKickoffMs(
    typeof time === 'string' ? time : undefined
  )
  const series = {
    game,
    id: row.id,
    tournament: {
      id: t.id,
      name: tournamentName,
      tier: text(t.tier)?.toLowerCase() ?? null,
    },
    stage,
    round: game === 'cs' && stage ? text(row.round) : null,
    position: game === 'valorant' && isId(row.position) ? row.position : null,
    bestOf: isId(format) ? format : null,
    startTimeMs: Number.isFinite(start) ? start : null,
    status,
    rawStatus: text(row.status),
    team1: readTeam(game, row.team1),
    team2: readTeam(game, row.team2),
    score:
      isCount(row.team1_score) && isCount(row.team2_score)
        ? { team1: row.team1_score, team2: row.team2_score }
        : null,
    observedAtMs,
  }
  return { ...series, ...outcome(row, series) }
}

/** A Valorant `/tournament_stages` row. Null when it has no usable IDs. */
export function readEsportsStageMeta(
  game: EsportsGame,
  value: unknown
): EsportsStageMeta | null {
  const r = asRow(value)
  if (!r || !isId(r.id) || !isId(r.tournament_id)) return null
  return {
    game,
    stageId: r.id,
    tournamentId: r.tournament_id,
    format: text(r.format)?.toLowerCase() ?? null,
    sequence: isCount(r.sequence) ? r.sequence : null,
    promotionCount: isId(r.promotion_team_count)
      ? r.promotion_team_count
      : null,
  }
}
