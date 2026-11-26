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
import { DAY_MS } from 'common/util/time'

import type { BdlParams, createBdlClient } from '../balldontlie-client'

export type { MajorLeague } from 'common/bdl/major-leagues'
type Client = Pick<ReturnType<typeof createBdlClient>, 'getAll'>
type Team = { id: number; name: string }
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
  eligible: boolean
  season: number
}

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
    row.status_state === 'scheduled' &&
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

function team(league: MajorLeague, value: unknown): Team {
  const row = asRow(value)
  const name = league === 'mlb' ? row?.display_name : row?.full_name
  if (!isId(row?.id) || typeof name !== 'string' || !name.trim())
    throw new Error('[sports-bdl-' + league + '] Game has no identifiable team')
  const trimmed = name.trim()
  const teams = Object.entries(TEAM_CODES[league] ?? {})
  const normalized = normalizeTeam(trimmed)
  const exact = teams.find(
    ([candidate]) => normalizeTeam(candidate) === normalized
  )
  if (exact) return { id: row.id, name: exact[0] }

  // Use a unique matching team code and nickname for provider name variants
  // such as "LA Clippers". Shared or reassigned abbreviations stay ambiguous.
  const code = league === 'nhl' ? row.tricode : row.abbreviation
  const lastWord = normalized.split(' ').pop()
  const aliases = teams.filter(
    ([candidate, abbr]) =>
      abbr === code && normalizeTeam(candidate).split(' ').pop() === lastWord
  )
  return { id: row.id, name: aliases.length === 1 ? aliases[0][0] : trimmed }
}

const unknownOpponent = /^(tbd|tba|to be (determined|announced))$/i
const exhibition =
  /\b(pre[ -]?season|spring training|exhibition|all[ -]?stars?|pro bowl|rising stars)\b/i

export function matchesMajorStage(
  league: MajorLeague,
  phase: string,
  game: MajorGame
) {
  if (league === 'nfl' && game.season < 2027) return false
  if (/regular season/i.test(phase)) return game.postseason === false
  if (/playoffs|world series/i.test(phase)) return game.postseason === true
  return true
}

/** The final enum is shared with adjudications. Certify only a played,
 * ordinary final in the league's wire format; leave shortened games for review. */
function ordinaryFinal(league: MajorLeague, row: Row) {
  const finalLabel = /^final(?:\s*\/\s*\d*ot)?$/i
  const status = typeof row.status === 'string' ? row.status.trim() : ''
  const period = isId(row.period) ? row.period : 0
  if (
    [row.summary, row.period_detail].some(
      (label) =>
        typeof label === 'string' &&
        /\b(forfeit(?:ed|ure)?|no contest|abandoned|suspended|postponed)\b/i.test(
          label
        )
    )
  )
    return false
  switch (league) {
    case 'nba':
      return (
        finalLabel.test(status) &&
        period >= 4 &&
        (row.time == null ||
          (typeof row.time === 'string' &&
            (finalLabel.test(row.time.trim()) ||
              /^0?0:00(?:\.0+)?$/.test(row.time.trim()))))
      )
    case 'nhl':
      return (
        typeof row.game_state === 'string' &&
        /^(OFF|FINAL|OVER)$/.test(row.game_state) &&
        period >= 3 &&
        (period > 3 || row.time_remaining === '00:00')
      )
    case 'wnba':
      // The feed labels both canceled games and played games "post". An
      // unplayed game has period zero; the final clock may show "10:00".
      return status === 'post' && period >= 4
    case 'mlb':
      return status === 'STATUS_FINAL' && period >= 9
    case 'nfl':
      return (
        finalLabel.test(status) &&
        score(row.home_team_q4) !== null &&
        score(row.visitor_team_q4) !== null
      )
  }
}

function mapGame(league: MajorLeague, row: Row): MajorGame {
  if (!isId(row.id) || !isId(row.season))
    throw new Error('[sports-bdl-' + league + '] Invalid game ID or season')
  const { startTime, slateDate, dateOnly } = scheduleTime(league, row)
  const home = team(league, row.home_team)
  const away = team(
    league,
    league === 'nhl' || league === 'mlb' ? row.away_team : row.visitor_team
  )
  if (home.id === away.id)
    throw new Error(
      '[sports-bdl-' + league + '] Both sides have the same provider team ID'
    )
  const visitorScores = league === 'nba' || league === 'nfl'
  const status = normalizeBdlStatus(row.status_state)
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
    ![home, away].some((team) => unknownOpponent.test(team.name)) &&
    ![home.name, away.name, row.status, row.summary].some(
      (value) => typeof value === 'string' && exhibition.test(value)
    )
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
    eligible,
    ...(isId(row.period) ? { period: String(row.period) } : {}),
    ...(status === 'in_progress' &&
    typeof clock === 'string' &&
    /^(?:\d{1,2}:\d{2}(?:\.\d+)?|\d{1,2}\.\d+)$/.test(clock)
      ? { clock }
      : {}),
  }
}

function numberDoubleheaders(games: MajorGame[]) {
  const series = new Map<string, MajorGame[]>()
  for (const game of games) {
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
  toDate: string,
  scoreIds?: ReadonlySet<number>
): Promise<MajorGame[]> {
  const from = dayMs(fromDate),
    to = dayMs(toDate)
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to)
    throw new Error('Invalid BDL schedule date range')
  const games = new Map<number, MajorGame>()
  const invalid = new Set<number>()
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
            // A score read is joined to exact market IDs and the slate below.
            // An unrelated malformed row must not discard its healthy neighbours.
            if (scoreIds) return true
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
        const id = asRow(raw)?.id
        if (scoreIds && (!isId(id) || !scoreIds.has(id) || invalid.has(id)))
          continue
        let game: MajorGame
        try {
          game = mapGame(league, raw as Row)
        } catch (error) {
          if (!scoreIds || !isId(id)) throw error
          invalid.add(id)
          games.delete(id)
          continue
        }
        if (scoreIds && game.status === 'final')
          game.eligible &&= ordinaryFinal(league, raw as Row)
        if (game.slateDate < fromDate || game.slateDate > toDate) continue
        const prior = games.get(game.id)
        if (prior && JSON.stringify(prior) !== JSON.stringify(game)) {
          if (scoreIds) {
            invalid.add(game.id)
            games.delete(game.id)
            continue
          }
          throw new Error(
            '[sports-bdl-' +
              league +
              '] Conflicting schedule rows for one game ID'
          )
        }
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
  games: readonly MajorGame[]
): Promise<Map<number, ProviderOdds[]>> {
  const result = new Map<number, ProviderOdds[]>(games.map((g) => [g.id, []]))
  const settings = BDL_LEAGUES[league]
  for (const batch of chunk(games, 50)) {
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
