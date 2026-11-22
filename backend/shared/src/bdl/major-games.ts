import { chunk } from 'lodash'
import type { MajorLeague } from 'common/bdl/major-leagues'
import { BDL_LEAGUES } from 'common/bdl/leagues'
import { TEAM_CODES } from 'common/sports-team-codes'
import { normalizeTeam } from 'common/sports-team-colors'
import { bdlEventId } from 'common/sports-ids'
import { parseSportsKickoffMs } from 'common/sports-kickoff-interface'
import {
  normalizeBdlStatus,
  ProviderGameStatus,
  ProviderOdds,
} from 'common/sports-provider'
import type {
  SportsFinalQualifier,
  SportsScoreboard,
} from 'common/sports-scoreboard'
import { DAY_MS } from 'common/util/time'

import type { BdlParams, createBdlClient } from '../balldontlie-client'

export type { MajorLeague } from 'common/bdl/major-leagues'
type Client = Pick<ReturnType<typeof createBdlClient>, 'getAll'>
type Team = { id: number; name: string; code?: string }
export type MajorGame = {
  id: number
  home: Team
  away: Team
  slateDate: string
  startTime: string | null
  dateOnly?: { date: string; venueTimeZone?: string }
  status: ProviderGameStatus
  homeScore: number | null
  awayScore: number | null
  period?: string
  clock?: string
  postseason?: boolean
  gameNumber?: number
  detail?: SportsScoreboard
  finalQualifier?: SportsFinalQualifier
  irregular?: boolean
  observedAt?: number
  scoreUpdatedTime?: number
  resumptionTime?: number
  eligible: boolean
  season: number
}

type ObservedTeam = { id: number | null; name: string | null; code?: string }
export type MajorObservation =
  | MajorGame
  | (Omit<MajorGame, 'home' | 'away' | 'eligible'> & {
      eligible: false
      entrantIssue: 'unidentifiable entrants'
      home: ObservedTeam
      away: ObservedTeam
    })
export const hasConfirmedEntrants = (
  game: MajorObservation
): game is MajorGame => !('entrantIssue' in game)

type Row = Record<string, unknown>
const asRow = (value: unknown): Row | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Row)
    : undefined
const isId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0
const score = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : null
const etDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function dayMs(date: unknown) {
  if (typeof date !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(date)) return NaN
  return parseSportsKickoffMs(date + 'T00:00:00Z')
}
// The wire format is RFC 3339. P1 stores milliseconds; preserve sub-millisecond
// source timestamps at that precision without accepting timezone-free values.
function providerMs(value: unknown) {
  return typeof value === 'string'
    ? parseSportsKickoffMs(
        value
          .toUpperCase()
          .replace(/([.]\d{3})\d+(?=Z$|[+-]\d{2}:\d{2}$)/, '$1')
      )
    : NaN
}
export function majorSourceRevision(league: MajorLeague, row: unknown) {
  const ms = league === 'nfl' ? providerMs(asRow(row)?.updated_at) : NaN
  return Number.isFinite(ms) ? ms : undefined
}
const isoDay = (time: number) => new Date(time).toISOString().slice(0, 10)

function scheduleTime(league: MajorLeague, row: Row) {
  const date = league === 'nhl' ? row.game_date : row.date
  const time =
    league === 'nba'
      ? row.datetime
      : league === 'nhl'
      ? row.start_time_utc
      : date
  const ms = providerMs(time)
  const startTime = Number.isFinite(ms) ? new Date(ms).toISOString() : null
  const sourceDate =
    typeof date === 'string' && Number.isFinite(dayMs(date)) ? date : null
  const slateDate = startTime ? etDay.format(ms) : sourceDate
  if (!slateDate)
    throw new Error(
      '[sports-bdl-' + league + '] Game has no usable schedule date'
    )
  // Only NBA and NHL document a civil date separately from a nullable start.
  // A bad timestamp is a data error, and NBA can echo an announced tip in status.
  const unannounced =
    (row.status_state === 'scheduled' || row.status_state === 'postponed') &&
    ((league === 'nba' &&
      row.datetime == null &&
      !(
        typeof row.status === 'string' &&
        /^\d{4}-\d{2}-\d{2}[Tt]/.test(row.status)
      )) ||
      (league === 'nhl' && row.start_time_utc == null))
  return {
    startTime,
    slateDate,
    sourceDate,
    dateOnly: unannounced ? { date: slateDate } : undefined,
  }
}

function team(league: MajorLeague, value: unknown): ObservedTeam {
  const row = asRow(value)
  const name = league === 'mlb' ? row?.display_name : row?.full_name
  const trimmed = typeof name === 'string' ? name.trim() : ''
  if (!isId(row?.id) || !trimmed)
    return { id: isId(row?.id) ? row.id : null, name: trimmed || null }
  const teams = Object.entries(TEAM_CODES[league] ?? {})
  const normalized = normalizeTeam(trimmed)
  const exact = teams.find(
    ([candidate]) => normalizeTeam(candidate) === normalized
  )
  const rawCode = league === 'nhl' ? row.tricode : row.abbreviation
  const code =
    typeof rawCode === 'string' && /^[A-Z0-9]{2,5}$/.test(rawCode)
      ? rawCode
      : undefined
  if (exact) return { id: row.id, name: exact[0], ...(code && { code }) }

  // Use a unique matching team code and nickname for provider name variants
  // such as "LA Clippers". Shared or reassigned abbreviations stay ambiguous.
  const lastWord = normalized.split(' ').pop()
  const aliases = teams.filter(
    ([candidate, abbr]) =>
      abbr === code && normalizeTeam(candidate).split(' ').pop() === lastWord
  )
  return {
    id: row.id,
    name: aliases.length === 1 ? aliases[0][0] : trimmed,
    ...(code && { code }),
  }
}

const unknownOpponent = /^(tbd|tba|to be (determined|announced))$/i
const exhibition =
  /\b(pre[ -]?season|spring training|exhibition|all[ -]?stars?|pro bowl|rising stars)\b/i
const identified = (value: ObservedTeam): value is Team =>
  value.id !== null && value.name !== null

const gameResultLabels = [
  /\b(?:forfeits?|forfeited) (?:due to|because of|owing to)\b/,
  /\b(?:no contests?|walk ?overs?|forfeitures?|abandonment)\b/,
  /^(?:(?:status|final|result)\W+)*(?:forfeit(?:s|ed)?|abandoned|awarded|retire(?:d|ment)|w\/o)(?:\W*$|\s*(?:[:(]|\b(?:due to|because of|by|win|loss|victory)\b))/,
  /\b(?:by|via|due to|ends? in|ended in|declared|ruled) (?:a |an )?(?:forfeit|retirement)\b/,
  /\b(?:game|match|contest|win|victory|result) (?:was |is |has been )?(?:forfeited|abandoned|awarded|retired)\b/,
  /\b(?:forfeits?|forfeited|abandons?|abandoned|retired from|retires from) (?:the |this |their )?(?:game|match|contest)\b/,
  /\b(?:team|side|home|away|hosts|visitors) (?:has )?(?:forfeits?|forfeited|retires?|retired)(?:$|[.,;:!)](?:\s|$))/,
]
const normalizeResultLabel = (s: string) =>
  s
    .toLowerCase()
    .replace(/[_‐‑–—-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// Settlement uses status_state. A game-level description can veto a result.
// A retiring team is different from a retiring batter or a runner retired at home.
function irregularGameLabel(value: unknown, home: string, away: string) {
  if (typeof value !== 'string') return false
  const label = normalizeResultLabel(value)
  if (gameResultLabels.some((pattern) => pattern.test(label))) return true
  return [home, away].some((name) => {
    const team = normalizeResultLabel(name) + ' '
    return (
      label.startsWith(team) &&
      /^(?:has )?(?:forfeits?|forfeited|retires?|retired)(?:$|[.,;:!)](?:\s|$))/.test(
        label.slice(team.length)
      )
    )
  })
}

export function mapMajorGame(
  league: MajorLeague,
  raw: unknown
): MajorObservation {
  const row = asRow(raw)
  if (!row) throw new Error('[sports-bdl-' + league + '] Invalid game record')
  if (!isId(row.id) || !isId(row.season))
    throw new Error('[sports-bdl-' + league + '] Invalid game ID or season')
  const { startTime, slateDate, dateOnly } = scheduleTime(league, row)
  const status = normalizeBdlStatus(row.status_state)
  const changed = majorSourceRevision(league, row)
  const home = team(league, row.home_team)
  const away = team(
    league,
    league === 'nhl' || league === 'mlb' ? row.away_team : row.visitor_team
  )
  if (!identified(home) || !identified(away) || home.id === away.id) {
    // The event is present, but its scores cannot be assigned to known entrants.
    return {
      id: row.id,
      season: row.season,
      slateDate,
      startTime,
      status,
      home,
      away,
      ...(changed !== undefined && { scoreUpdatedTime: changed }),
      homeScore: null,
      awayScore: null,
      eligible: false,
      entrantIssue: 'unidentifiable entrants',
    }
  }
  const visitorScores = league === 'nba' || league === 'nfl'
  const homeScore = score(
    league === 'mlb'
      ? asRow(row.home_team_data)?.runs
      : visitorScores
      ? row.home_team_score
      : row.home_score
  )
  const awayScore = score(
    league === 'mlb'
      ? asRow(row.away_team_data)?.runs
      : visitorScores
      ? row.visitor_team_score
      : row.away_score
  )
  const clock =
    league === 'nhl'
      ? row.time_remaining
      : league === 'mlb'
      ? row.display_clock
      : row.time
  // The NHL feed has no season-type filter; its caller also gates on the enabled calendar phase.
  const eligible =
    (league !== 'mlb' ||
      row.season_type === 'regular' ||
      row.season_type === 'postseason') &&
    ![home, away].some((team) =>
      unknownOpponent.test(
        team.name.replace(/\.\s*/gu, '').replace(/\s+/gu, ' ').trim()
      )
    ) &&
    ![home.name, away.name, row.status, row.summary].some(
      (value) => typeof value === 'string' && exhibition.test(value)
    )
  const detail = scoreDetail(league, row)
  const overtime =
    status === 'final' &&
    (((league === 'nba' || league === 'wnba') &&
      isId(row.period) &&
      row.period > 4) ||
      (league === 'nfl' &&
        (score(row.home_team_ot) !== null ||
          score(row.visitor_team_ot) !== null)))
  const descriptions = [
    row.status,
    league === 'nhl' ? row.game_state : undefined,
  ]
  const contradicted = descriptions.some((value) => {
    if (typeof value !== 'string') return false
    const label = normalizeResultLabel(value)
    // WNBA uses 'post' for both played finals and unplayed canceled games.
    if (league === 'wnba' && status === 'canceled' && label === 'post')
      return row.period !== 0 || homeScore !== 0 || awayScore !== 0
    if (
      /^(?:live|pre|fut|crit)$/.test(label) ||
      /^(?:game )?(?:cancelled|canceled|postponed|suspended|delayed|scheduled|in progress)\b/.test(
        label
      )
    )
      return (
        status === 'final' || (status === 'canceled' && !/cancel/.test(label))
      )
    return (
      status === 'canceled' &&
      /^(?:final|finished|official final|off|game over)\b/.test(label)
    )
  })
  const irregular =
    contradicted ||
    [
      row.status,
      row.summary,
      row.period_detail,
      league === 'nhl' ? row.game_state : undefined,
    ].some((value) => irregularGameLabel(value, home.name, away.name))
  return {
    id: row.id,
    home,
    away,
    startTime,
    slateDate,
    ...(dateOnly ? { dateOnly } : {}),
    season: row.season,
    ...(typeof row.postseason === 'boolean'
      ? { postseason: row.postseason }
      : {}),
    status,
    homeScore,
    awayScore,
    ...(detail && { detail }),
    ...(changed !== undefined && { scoreUpdatedTime: changed }),
    ...(overtime && { finalQualifier: 'OT' as const }),
    ...(irregular && { irregular: true }),
    eligible,
    ...(isId(row.period) ? { period: String(row.period) } : {}),
    ...(status === 'in_progress' &&
    typeof clock === 'string' &&
    /^(?:\d{1,2}:\d{2}(?:\.\d+)?|\d{1,2}\.\d+)$/.test(clock)
      ? { clock }
      : {}),
  }
}

function scoreDetail(
  league: MajorLeague,
  row: Row
): SportsScoreboard | undefined {
  if (league === 'nhl') {
    const home = score(row.home_sog),
      away = score(row.away_sog)
    return home !== null || away !== null
      ? { shots: { home, away } }
      : undefined
  }
  let home: unknown[] = [],
    away: unknown[] = []
  if (league === 'mlb') {
    const h = asRow(row.home_team_data)?.inning_scores
    const a = asRow(row.away_team_data)?.inning_scores
    home = Array.isArray(h) ? h : []
    away = Array.isArray(a) ? a : []
  } else if (league === 'nba' || league === 'nfl') {
    const periods =
      league === 'nba'
        ? ['q1', 'q2', 'q3', 'q4', 'ot1', 'ot2', 'ot3']
        : ['q1', 'q2', 'q3', 'q4', 'ot']
    const field = league === 'nba' ? '_' : '_team_'
    home = periods.map((period) => row['home' + field + period])
    away = periods.map((period) => row['visitor' + field + period])
  }
  const pairs = Array.from(
    { length: Math.min(32, Math.max(home.length, away.length)) },
    (_, i) => ({
      home: score(home[i]),
      away: score(away[i]),
    })
  )
  // Keep missing periods in position and omit future periods that have no observations.
  while (
    pairs.length &&
    pairs[pairs.length - 1].home === null &&
    pairs[pairs.length - 1].away === null
  )
    pairs.pop()
  return pairs.length ? { periodScores: pairs } : undefined
}

function numberDoubleheaders(games: MajorObservation[]) {
  const series = new Map<string, MajorObservation[]>()
  for (const game of games) {
    if (game.home.id === null || game.away.id === null) continue
    const key = [
      game.slateDate,
      Math.min(game.home.id, game.away.id),
      Math.max(game.home.id, game.away.id),
    ].join(':')
    const group = series.get(key) ?? []
    group.push(game)
    series.set(key, group)
  }
  for (const group of series.values()) {
    if (group.length < 2) continue
    if (
      group.some((game) => !game.startTime) ||
      new Set(group.map((game) => game.startTime)).size !== group.length
    ) {
      // There is no reliable game number in the MLB schema.
      for (const game of group) game.eligible = false
      continue
    }
    group
      .sort((a, b) => a.startTime!.localeCompare(b.startTime!))
      .forEach((game, i) => {
        game.gameNumber = i + 1
      })
  }
}

/** Inclusive Eastern slate. Preserve observed IDs even when kickoff time is still unknown. */
export async function fetchMajorGames(
  client: Client,
  league: MajorLeague,
  fromDate: string,
  toDate: string
): Promise<MajorObservation[]> {
  const from = dayMs(fromDate),
    to = dayMs(toDate)
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to)
    throw new Error('Invalid BDL schedule date range')
  const games = new Map<number, MajorObservation>()
  // Pad the provider filter by a day at each end. US-local and UTC slates can differ.
  for (let first = from - DAY_MS; first <= to + DAY_MS; first += 14 * DAY_MS) {
    const dates: string[] = []
    for (
      let day = first;
      day <= Math.min(first + 13 * DAY_MS, to + DAY_MS);
      day += DAY_MS
    )
      dates.push(isoDay(day))
    // WNBA season_type is scalar: 2 regular, 3 postseason. NFL supports an array.
    const filters: BdlParams[] =
      league === 'wnba'
        ? [{ season_type: '2' }, { season_type: '3' }]
        : league === 'nfl'
        ? [{ season_types: [2, 3] }]
        : [{}]
    for (const filter of filters) {
      const rows = await client.getAll<unknown>(
        BDL_LEAGUES[league].apiBase + '/games',
        { dates, ...filter },
        {
          maxPages: 20,
          matches: (value) => {
            const row = asRow(value)
            if (!row) return false
            const { startTime, slateDate, sourceDate } = scheduleTime(
              league,
              row
            )
            if (
              league === 'wnba' &&
              row.postseason !==
                ('season_type' in filter && filter.season_type === '3')
            )
              return false
            return sourceDate
              ? dates.includes(sourceDate)
              : dates.includes(slateDate) ||
                  (!!startTime && dates.includes(startTime.slice(0, 10)))
          },
        }
      )
      for (const raw of rows) {
        const game = mapMajorGame(league, raw)
        if (game.slateDate < fromDate || game.slateDate > toDate) continue
        const prior = games.get(game.id)
        if (prior && JSON.stringify(prior) !== JSON.stringify(game))
          throw new Error(
            '[sports-bdl-' +
              league +
              '] Conflicting schedule rows for one game ID'
          )
        games.set(game.id, game)
      }
    }
  }
  const result = [...games.values()]
  if (league === 'mlb') numberDoubleheaders(result)
  return result
}

/** Only rows for requested game IDs may seed a contract. An incomplete newer row
 * is retained so the selector cannot resurrect an older, withdrawn quote. */
export async function fetchMajorOdds(
  client: Client,
  league: MajorLeague,
  games: readonly MajorObservation[]
): Promise<Map<number, ProviderOdds[]>> {
  const result = new Map<number, ProviderOdds[]>(games.map((g) => [g.id, []]))
  const settings = BDL_LEAGUES[league]
  for (const batch of chunk(games.filter(hasConfirmedEntrants), 50)) {
    const byId = new Map(batch.map((game) => [game.id, game]))
    const rows = await client.getAll<unknown>(
      settings.oddsApiBase + '/odds',
      { game_ids: [...byId.keys()] },
      {
        maxPages: 20,
        matches: (value) => {
          const id = asRow(value)?.game_id
          return isId(id) && byId.has(id)
        },
      }
    )
    for (const raw of rows) {
      const row = raw as Row,
        game = byId.get(row.game_id as number)!
      const updatedAtMs = providerMs(row.updated_at)
      if (
        typeof row.vendor !== 'string' ||
        !row.vendor.trim() ||
        !Number.isFinite(updatedAtMs)
      )
        throw new Error(
          '[sports-bdl-' +
            league +
            '] Quote has no identifiable vendor or timestamp'
        )
      const outcomes: ProviderOdds['outcomes'][number][] = []
      for (const [entrant, odds] of [
        [game.away, row.moneyline_away_odds],
        [game.home, row.moneyline_home_odds],
      ] as const) {
        if (typeof odds === 'number' && Number.isFinite(odds))
          outcomes.push({
            outcome: { entrantId: String(entrant.id) },
            americanOdds: odds,
          })
      }
      result.get(game.id)!.push({
        eventId: bdlEventId(league, game.id),
        vendor: row.vendor.trim().toLowerCase(),
        updatedAtMs,
        outcomes,
      })
    }
  }
  return result
}
