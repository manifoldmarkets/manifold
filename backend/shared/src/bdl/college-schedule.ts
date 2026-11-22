import { BDL_LEAGUES } from 'common/bdl/leagues'
import {
  collegeApRanks,
  collegeDay,
  collegeGame,
  collegeId,
  collegeObject,
  collegeTime,
  matchCollegeTeams,
  type CollegeBasketballLeague,
  type CollegeGame,
  type CollegeLeague,
  type CollegeTeam,
} from 'common/bdl/college-games'
import { projectCollegeBracket } from 'common/bdl/college-bracket'
import { DAY_MS } from 'common/util/time'
import type { createBdlClient } from '../balldontlie-client'

type Client = Pick<ReturnType<typeof createBdlClient>, 'get' | 'getAll'>

/** Recorded selectors use UTC days. Eastern evenings can fall on the following UTC day. */
export async function readCollegeGames(
  client: Client,
  league: CollegeLeague,
  season: number,
  from: string,
  to: string
) {
  if (
    !collegeDay(from) ||
    !collegeDay(to) ||
    !Number.isInteger(season) ||
    season < 1000 ||
    season > 9999
  )
    throw new Error('Invalid college schedule window')
  const first = Date.parse(from + 'T00:00:00Z'),
    last = Date.parse(to + 'T00:00:00Z')
  const maxDays = BDL_LEAGUES[league].maxLeadDays
  if (last < first || last - first >= maxDays * DAY_MS)
    throw new Error(
      'College schedule exceeds the configured ' + maxDays + '-day window'
    )
  const games = new Map<number, CollegeGame>()
  for (let start = first; start <= last + DAY_MS; start += 7 * DAY_MS) {
    const dates: string[] = []
    for (
      let day = start;
      day <= Math.min(last + DAY_MS, start + 6 * DAY_MS);
      day += DAY_MS
    )
      dates.push(new Date(day).toISOString().slice(0, 10))
    const rows = await client.getAll<unknown>(
      BDL_LEAGUES[league].apiBase + '/games',
      { seasons: [season], dates },
      {
        maxPages: 20,
        matches: (raw) => {
          const row = collegeObject(raw),
            day = collegeTime(row.date)?.slice(0, 10) ?? collegeDay(row.date)
          return row.season === season && day !== null && dates.includes(day)
        },
      }
    )
    for (const raw of rows) {
      const game = collegeGame(league, raw)
      const prior = games.get(game.gameId)
      if (prior && JSON.stringify(prior) !== JSON.stringify(game))
        throw new Error(
          'Conflicting observations for college game ' + game.gameId
        )
      games.set(game.gameId, game)
    }
  }
  return [...games.values()].filter(
    (game) =>
      game.slateDate !== null && game.slateDate >= from && game.slateDate <= to
  )
}

export async function readCollegeApPoll(
  client: Client,
  league: Exclude<CollegeLeague, 'cbb'>,
  season: number,
  week: number
) {
  if (
    !Number.isInteger(season) ||
    season < 1000 ||
    season > 9999 ||
    !collegeId(week)
  )
    throw new Error('Invalid college poll season or week')
  const path = BDL_LEAGUES[league].apiBase + '/rankings',
    params = { season, week }
  const matches = (raw: unknown) => {
    const row = collegeObject(raw)
    return row.season === season && row.week === week
  }
  if (league === 'ncaaf') {
    // This endpoint returns one complete, unpaginated AP poll.
    const body = collegeObject((await client.get(path, params)).body)
    if (
      !Array.isArray(body.data) ||
      !body.data.every(matches) ||
      collegeObject(body.meta).next_cursor != null
    )
      throw new Error('Incomplete or unexpected college football AP poll')
    return collegeApRanks(league, season, week, body.data)
  }
  const rows = await client.getAll(path, params, { matches, maxPages: 4 })
  return collegeApRanks(league, season, week, rows)
}

export async function readCollegeBracket(
  client: Client,
  league: CollegeBasketballLeague,
  season: number,
  games: readonly CollegeGame[],
  numbering?: 0 | 1
) {
  if (!Number.isInteger(season) || season < 1000 || season > 9999)
    throw new Error('Invalid college bracket season')
  const rows = await client.getAll<unknown>(
    BDL_LEAGUES[league].apiBase + '/bracket',
    { season },
    {
      matches: (raw) => collegeObject(raw).season === season,
      maxPages: 4,
    }
  )
  return projectCollegeBracket(league, season, rows, games, numbering)
}

/** Send one actionable report for every distinct unmatched provider ID in this read.
 * Publishing, retries and funding stay with the operator rather than treating a nickname as an identity. */
export async function identifyCollegeTeams(
  league: CollegeLeague,
  games: readonly CollegeGame[],
  names: readonly string[],
  knownNames: ReadonlyMap<number, string>,
  reportUnmatched: (team: {
    league: CollegeLeague
    id: number
    name: string
  }) => Promise<void>
) {
  if (games.some((game) => game.league !== league))
    throw new Error('College team mapping needs one league')
  const teams = games
    .flatMap((g) => [g.home, g.away])
    .filter((t): t is CollegeTeam => t !== null)
  const { mapped, unmatched } = matchCollegeTeams(teams, names, knownNames)
  for (const game of games)
    for (const id of game.unnamedTeamIds ?? []) {
      if (!unmatched.has(id)) unmatched.set(id, 'Team name unavailable')
    }
  for (const [id, name] of unmatched)
    await reportUnmatched({ league, id, name })
  return mapped
}
