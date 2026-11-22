import { BDL_STUCK_GAME_MS } from './constants'
import { BDL_LEAGUES, type BdlLeagueKey } from './leagues'
import { bdlEventId } from '../sports-ids'
import { parseSportsKickoffMs } from '../sports-kickoff-interface'
import { normalizeBdlStatus, type ProviderGameStatus } from '../sports-provider'

export const INTERNATIONAL_BASKETBALL_LEAGUES = [
  'euroleague',
  'eurocup',
  'bcl',
  'acb',
  'bsl',
  'gbl',
  'lba',
  'bbl',
  'lnb',
  'aba',
  'lkl',
  'vtb',
  'bnxt',
  'israel',
  'cba',
] as const satisfies readonly BdlLeagueKey[]
export type InternationalBasketballLeague =
  (typeof INTERNATIONAL_BASKETBALL_LEAGUES)[number]

type Team = { id: number; name: string; abbreviation: string | null }
type Score = { home: number; away: number }
type Game = {
  league: InternationalBasketballLeague
  id: number
  eventId: string
  season: number | null
  startTimeMs: number | null
  providerDate: string | null
  home: Team
  away: Team
  status: ProviderGameStatus
  rawStatus: string | null
  score: Score | null
  currentPeriod: number | null
  seasonType: string | null
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}
const positive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0
const points = (value: unknown): value is number =>
  value === 0 || positive(value)
const label = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : null
const shanghaiDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
function readTeam(value: unknown, cba: boolean): Team | null {
  const team = record(value)
  const name = label(team?.name)
  if (!positive(team?.id) || !name) return null
  return {
    id: team.id,
    name,
    abbreviation: cba ? null : label(team.abbreviation),
  }
}
function readScore(row: Record<string, unknown>): Score | null {
  const { home_team_score: home, visitor_team_score: away } = row
  return points(home) && points(away) ? { home, away } : null
}

// Only these two free-text CBA status values are supported by actual game recordings.
// A CBA period or a pair of scores alone cannot establish the game state.
function cbaFields(row: Record<string, unknown>) {
  const status: ProviderGameStatus =
    row.status === 'final' || row.status === 'scheduled'
      ? row.status
      : 'unknown'
  return {
    status,
    currentPeriod: positive(row.current_period) ? row.current_period : null,
    seasonType: label(row.season_type),
  }
}

export function readInternationalBasketballGame(
  league: InternationalBasketballLeague,
  value: unknown
): Game | null {
  const row = record(value)
  if (!row || !positive(row.id)) return null
  const isCba = league === 'cba'
  const home = readTeam(row.home_team, isCba)
  const away = readTeam(row.visitor_team, isCba)
  if (!home || !away || home.id === away.id) return null
  const start = parseSportsKickoffMs(
    typeof row.datetime === 'string' ? row.datetime : undefined
  )
  return {
    league,
    id: row.id,
    eventId: bdlEventId(league, row.id),
    season: positive(row.season) ? row.season : null,
    startTimeMs: Number.isFinite(start) ? start : null,
    providerDate: Number.isFinite(start)
      ? isCba
        ? shanghaiDay.format(start)
        : new Date(start).toISOString().slice(0, 10)
      : null,
    home,
    away,
    rawStatus: label(row.status),
    score: readScore(row),
    ...(isCba
      ? cbaFields(row)
      : {
          status: normalizeBdlStatus(row.status, 'european-basketball-status'),
          currentPeriod: null,
          seasonType: null,
        }),
  }
}

// These are read-side observations for review. The caller supplies the clock.
export function internationalBasketballAttention(game: Game, nowMs: number) {
  if (game.status === 'unknown') return 'unknown-status'
  if (
    game.status === 'final' &&
    (!game.score || game.score.home === game.score.away)
  )
    return 'unverified-final'
  if (
    game.status === 'scheduled' &&
    (game.currentPeriod !== null ||
      (game.score && (game.score.home > 0 || game.score.away > 0)))
  )
    return 'scheduled-with-play'
  if (
    (game.status === 'scheduled' || game.status === 'in_progress') &&
    game.startTimeMs !== null &&
    Number.isFinite(nowMs) &&
    nowMs - game.startTimeMs >= BDL_STUCK_GAME_MS
  )
    return 'overdue'
  return null
}

type FinalObservation = { game: Game; observedAtMs: number }
export function internationalBasketballFinalChanged(
  before: FinalObservation,
  after: FinalObservation
): boolean {
  const prior = before.game
  const next = after.game
  if (
    prior.eventId !== next.eventId ||
    prior.home.id !== next.home.id ||
    prior.away.id !== next.away.id ||
    !Number.isFinite(before.observedAtMs) ||
    !Number.isFinite(after.observedAtMs) ||
    after.observedAtMs <= before.observedAtMs ||
    prior.status !== 'final' ||
    next.status !== 'final' ||
    !prior.score ||
    !next.score
  )
    return false
  return (
    prior.score.home !== next.score.home || prior.score.away !== next.score.away
  )
}

type Update = { id: number; sequence: number; period: number; score: Score }
type PeriodScore = { period: number; score: Score }
export type BasketballScoring = {
  updates: Update[]
  // Last scoring update can precede the current game period. There is no clock.
  lastScoringPeriod: number
  periodScores: PeriodScore[] | null
  scoreDecreased: boolean
}

// The European schema is shared. No populated CBA scoring payload was verified.
// Scope must come from the source request, because IDs are local to each league.
export function readInternationalBasketballScoring(
  game: Pick<Game, 'league' | 'id'>,
  source: {
    league: InternationalBasketballLeague
    gameId: number
    rows: readonly unknown[]
  }
): BasketballScoring | null {
  if (
    game.league === 'cba' ||
    source.league !== game.league ||
    source.gameId !== game.id ||
    !positive(game.id)
  )
    return null
  const updates: Update[] = []
  const ids = new Set<number>()
  for (const raw of source.rows) {
    const row = record(raw)
    if (
      !row ||
      row.game_id !== game.id ||
      !positive(row.id) ||
      !positive(row.sequence) ||
      !positive(row.period) ||
      ids.has(row.id)
    )
      return null
    const score = readScore(row)
    if (!score) return null
    ids.add(row.id)
    updates.push({
      id: row.id,
      sequence: row.sequence,
      period: row.period,
      score,
    })
  }
  if (!updates.length) return null
  updates.sort((a, b) => a.sequence - b.sequence)
  const periodScores: PeriodScore[] = []
  let contiguous = true
  let scoreDecreased = false
  let prior = { sequence: 0, period: 0, score: { home: 0, away: 0 } }
  let periodStart = prior.score
  for (const update of updates) {
    if (update.sequence === prior.sequence || update.period < prior.period)
      return null
    if (
      update.sequence !== prior.sequence + 1 ||
      update.period > prior.period + 1
    )
      contiguous = false
    if (
      update.score.home < prior.score.home ||
      update.score.away < prior.score.away
    )
      scoreDecreased = true
    if (update.period !== prior.period) {
      periodStart = prior.score
      periodScores.push({ period: update.period, score: update.score })
    }
    periodScores[periodScores.length - 1].score = {
      home: update.score.home - periodStart.home,
      away: update.score.away - periodStart.away,
    }
    prior = update
  }
  return {
    updates,
    lastScoringPeriod: prior.period,
    periodScores: contiguous && !scoreDecreased ? periodScores : null,
    scoreDecreased,
  }
}

type ListResponse = { request: { path: string }; status: number; body: unknown }

// Consume a completed provider response. No network, inference of league from a
// team, or implicit continuation. Missing/malformed pages differ from an empty list.
function listPage(
  league: InternationalBasketballLeague,
  endpoint: 'games' | 'scoring',
  response: ListResponse
) {
  if (
    response.status !== 200 ||
    response.request.path !== BDL_LEAGUES[league].apiBase + '/' + endpoint
  )
    return null
  const body = record(response.body)
  if (!body || !Array.isArray(body.data)) return null
  const meta = record(body.meta)
  if (body.meta != null && !meta) return null
  const next = meta?.next_cursor
  if (next != null && !(typeof next === 'string' || points(next))) return null
  return {
    rows: body.data as unknown[],
    nextCursor: next == null || next === '' ? null : String(next),
  }
}

export function readInternationalBasketballGamesPage(
  league: InternationalBasketballLeague,
  response: ListResponse
) {
  const page = listPage(league, 'games', response)
  if (!page) return null
  const games = new Map<number, Game>()
  const unavailableIds = new Set<number>()
  let unidentifiedRows = 0
  for (const raw of page.rows) {
    const id = record(raw)?.id
    if (!positive(id)) {
      unidentifiedRows++
      continue
    }
    const game = readInternationalBasketballGame(league, raw)
    const previous = games.get(id)
    // An invalid duplicate is also evidence against a unique trustworthy row.
    if (
      !game ||
      (previous && JSON.stringify(previous) !== JSON.stringify(game))
    )
      unavailableIds.add(id)
    else games.set(id, game)
  }
  for (const id of unavailableIds) games.delete(id)
  return {
    games: [...games.values()],
    unavailableIds: [...unavailableIds],
    unidentifiedRows,
    nextCursor: page.nextCursor,
  }
}

export function readInternationalBasketballScoringPage(
  game: Pick<Game, 'league' | 'id'>,
  response: ListResponse & {
    request: { path: string; params: Record<string, unknown> }
  }
) {
  const page = listPage(game.league, 'scoring', response)
  const id = response.request.params.game_id
  if (!page || (id !== game.id && id !== String(game.id))) return null
  return {
    scoring: readInternationalBasketballScoring(game, {
      league: game.league,
      gameId: game.id,
      rows: page.rows,
    }),
    nextCursor: page.nextCursor,
  }
}
