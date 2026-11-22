import { chunk } from 'lodash'
import { BDL_LEAGUES } from 'common/bdl/leagues'
import type { MajorLeague } from 'common/bdl/major-leagues'
import type { SportsScoreboard } from 'common/sports-scoreboard'
import { parseSportsKickoffMs } from 'common/sports-kickoff-interface'
import { DAY_MS } from 'common/util/time'
import { BdlHttpError, type createBdlClient } from '../balldontlie-client'
import { log } from '../monitoring/log'
import {
  hasConfirmedEntrants,
  mapMajorGame,
  type MajorGame,
  type MajorObservation,
} from './major-games'

type Client = Pick<ReturnType<typeof createBdlClient>, 'get' | 'getAll'>
type Target = { id: number; season?: number; startTime?: string }
type Standing = NonNullable<NonNullable<SportsScoreboard['standings']>['home']>
const object = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined

function standing(
  league: MajorLeague,
  row: Record<string, unknown>
): Standing | undefined {
  const count = (n: unknown): n is number =>
    typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 1000
  const { wins, losses, ties, ot_losses } = row
  if (!count(wins) || !count(losses)) return
  const rank =
    league === 'nba'
      ? row.conference_rank
      : league === 'mlb'
      ? row.sport_rank
      : row.playoff_seed
  return {
    wins,
    losses,
    ...(count(rank) && rank > 0 && { rank }),
    ...(league === 'nfl' && count(ties) && { ties }),
    ...(league === 'nhl' && count(ot_losses) && { overtimeLosses: ot_losses }),
  }
}

async function addStandings(
  client: Client,
  league: MajorLeague,
  games: MajorGame[]
) {
  const season = games[0].season
  const entrants = new Set(
    games.flatMap((game) => [game.home.id, game.away.id])
  )
  // All five standings endpoints return an unpaginated season table.
  const response = await client.get(
    BDL_LEAGUES[league].apiBase + '/standings',
    { season }
  )
  const rows = object(response.body)?.data
  if (!Array.isArray(rows)) throw new Error('Missing standings array')
  const teams = new Map<number, Standing>()
  const duplicate = new Set<number>()
  for (const item of rows) {
    const row = object(item)
    if (row?.season !== season) continue
    const id = object(row.team)?.id
    if (typeof id !== 'number' || !entrants.has(id)) continue
    const record = standing(league, row)
    if (!record) continue
    if (teams.has(id)) duplicate.add(id)
    teams.set(id, record)
  }
  for (const id of duplicate) teams.delete(id)
  for (const game of games) {
    const home = teams.get(game.home.id),
      away = teams.get(game.away.id)
    if (home || away)
      game.detail = {
        ...game.detail,
        standings: { ...(home && { home }), ...(away && { away }) },
      }
  }
}

/** Read tracked events by official ID. Kickoff dates only optimize batched lookups. */
export async function fetchMajorSnapshots(
  client: Client,
  league: MajorLeague,
  targets: readonly Target[],
  options: { standings?: boolean; onMalformed?: (id: number) => void } = {}
): Promise<Map<number, MajorObservation>> {
  const base = BDL_LEAGUES[league].apiBase + '/games'
  const result = new Map<number, MajorObservation>()
  const ids = new Set(targets.map((t) => t.id))
  for (const id of ids) {
    if (!Number.isSafeInteger(id) || id <= 0)
      throw new Error('Invalid BDL game ID')
  }
  const invalid = new Set<number>()
  function reject(id: number, error: unknown) {
    if (!options.onMalformed) throw error
    result.delete(id)
    invalid.add(id)
    options.onMalformed(id)
  }
  function accept(row: unknown, id: number) {
    if (invalid.has(id)) return
    try {
      const game = mapMajorGame(league, row)
      if (game.id !== id || !ids.has(id) || result.has(id))
        throw new Error('Unexpected or duplicate BDL game ID')
      result.set(id, game)
    } catch (error) {
      reject(id, error)
    }
  }
  if (league === 'nhl') {
    // NHL has game_ids[] on the collection and no single-game route.
    for (const group of chunk([...ids], 50)) {
      const expected = new Set(group)
      const rows = await client.getAll<unknown>(
        base,
        { game_ids: group },
        {
          maxPages: 10,
          matches: (row) => expected.has(Number(object(row)?.id)),
        }
      )
      for (const row of rows) accept(row, Number(object(row)?.id))
    }
  } else {
    // Query a shared slate once when multiple targets have known kickoff dates.
    // Providers may filter dates in UTC or the venue's civil time.
    const dates = new Set<string>()
    const dated = new Set<number>()
    for (const target of targets) {
      const time = parseSportsKickoffMs(target.startTime)
      if (!Number.isFinite(time)) continue
      dated.add(target.id)
      for (const shift of [-DAY_MS, 0, DAY_MS])
        dates.add(new Date(time + shift).toISOString().slice(0, 10))
    }
    if (dated.size > 1) {
      for (const days of chunk([...dates].sort(), 14)) {
        const rows = await client.getAll<unknown>(
          base,
          { dates: days },
          {
            maxPages: 20,
            matches: (row) => {
              const raw = object(row),
                date = raw?.date
              if (typeof date === 'string' && days.includes(date.slice(0, 10)))
                return true
              // A requested, malformed target can be quarantined by ID without
              // treating the entire dated page as evidence for an absent game.
              if (
                options.onMalformed &&
                typeof raw?.id === 'number' &&
                ids.has(raw.id)
              ) {
                reject(raw.id, new Error('Unconfirmed game date'))
                return true
              }
              return false
            },
          }
        )
        for (const row of rows) {
          const id = object(row)?.id
          if (typeof id === 'number' && ids.has(id)) accept(row, id)
        }
      }
    }
    for (const id of ids) {
      if (result.has(id) || invalid.has(id)) continue
      try {
        const response = await client.get(base + '/' + id)
        const record = object(response.body)?.data
        if (object(record)?.id !== id)
          reject(id, new Error('BDL detail returned a different game ID'))
        else accept(record, id)
      } catch (error) {
        if (!(error instanceof BdlHttpError && error.status === 404))
          throw error
      }
    }
  }
  if (options.standings) {
    const seasons = new Map<number, MajorGame[]>()
    for (const game of result.values()) {
      if (hasConfirmedEntrants(game))
        seasons.set(game.season, [...(seasons.get(game.season) ?? []), game])
    }
    for (const games of seasons.values()) {
      try {
        await addStandings(client, league, games)
      } catch {
        log.warn('[sports-bdl-' + league + '] Standings unavailable')
      }
    }
  }
  return result
}
