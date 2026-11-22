jest.mock('./request-stats', () => ({
  recordServiceBdlResponse: jest.fn().mockResolvedValue(undefined),
  reportBdlRequestIssue: jest.fn(),
}))
jest.mock('../utils', () => ({ isProd: () => true }))
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { DAY_MS } from 'common/util/time'
import {
  nbaSeriesEventId,
  projectNbaPlayoffSeries,
} from 'common/bdl/nba-playoff-series'
import { readNbaPlayoffSeason } from './nba-playoff-series'

const finals = (
  JSON.parse(
    readFileSync(
      resolve(
        __dirname,
        '../../test/fixtures/bdl/nba/games__2025-playoff-finals.json'
      ),
      'utf8'
    )
  ) as { data: unknown[] }
).data
const season = 2025,
  start = Date.parse('2026-04-18T18:00:00Z')
const team = (id: number) => ({
  id,
  full_name: 'Club ' + id,
  abbreviation: 'C' + id,
  conference: id <= 8 ? 'East' : 'West',
})
function game(
  id: number,
  home: number,
  away: number,
  day: number,
  homeWon = true
) {
  return {
    id,
    season,
    postseason: true,
    datetime: new Date(start + day * DAY_MS).toISOString(),
    status_state: 'final',
    home_team: team(home),
    visitor_team: team(away),
    home_team_score: homeWon ? 111 : 99,
    visitor_team_score: homeWon ? 99 : 111,
  }
}
function completeBracket() {
  let entrants = Array.from({ length: 16 }, (_, i) => i + 1),
    number = 1,
    round = 0
  const games: ReturnType<typeof game>[] = []
  while (entrants.length > 1) {
    const winners: number[] = []
    for (let i = 0; i < entrants.length; i += 2) {
      const [a, b] = [entrants[i], entrants[i + 1]]
      winners.push(a)
      for (let g = 0; g < 4; g++)
        games.push(
          game(
            number++,
            g % 2 ? b : a,
            g % 2 ? a : b,
            round * 10 + g,
            g % 2 === 0
          )
        )
    }
    entrants = winners
    round++
  }
  return games
}
const view = (source: readonly unknown[], complete = true) =>
  projectNbaPlayoffSeries(season, source, complete)
test('the five recorded Finals alternate venues, count four actual wins and retain the provider season in the derived key', () => {
  const v = view(finals)
  expect(v.review).toEqual([])
  expect(v.series[0]).toMatchObject({
    eventId: 'bdl:nba-series:2025:20-27',
    wins: [4, 1],
    winnerId: 20,
    clinchingGameId: 21716138,
    round: null,
    nextSeriesId: null,
  })
  expect(v.series[0].teams.map((t) => t.name)).toEqual([
    'New York Knicks',
    'San Antonio Spurs',
  ])
  expect(v.championEventId).toBe('bdl:nba-champion:2025')
  expect(v.champion).toBeNull()
  expect(view([...finals].reverse())).toEqual(v)
  expect(nbaSeriesEventId(2025, 27, 20)).toBe(v.series[0].eventId)
})
test('only a complete sixteen-team elimination tree establishes the derived champion, rounds and fourteen links', () => {
  const games = completeBracket()
  const v = view(games)
  expect(
    [1, 2, 3, 4].map((r) => v.series.filter((s) => s.round === r).length)
  ).toEqual([8, 4, 2, 1])
  expect(v.series.filter((s) => s.nextSeriesId !== null)).toHaveLength(14)
  expect(v.champion).toEqual({
    teamId: 1,
    seriesId: 'bdl:nba-series:2025:1-9',
    clinchingGameId: 60,
  })
  expect(view(games.slice(0, -1)).champion).toBeNull()
  const partial = view(games, false)
  expect(partial.champion).toBeNull()
  expect(
    partial.series.every((s) => s.winnerId === null && s.round === null)
  ).toBe(true)
  expect(view(games.filter((g) => g.id !== 1)).champion).toBeNull()
  expect(
    view(games.concat({ ...games[0], postseason: false, id: 701 }))
  ).toEqual(v)
})
test('deduplicates identical provider game IDs and holds conflicting identities or scores without counting twice', () => {
  const games = completeBracket()
  expect(view([...games, games[0]])).toEqual(view(games))
  const flipped = view([...games, { ...games[0], postseason: false }])
  expect(flipped.champion).toBeNull()
  expect(flipped.series.every((s) => s.winnerId === null)).toBe(true)
  for (const more of [
    { ...games[0], home_team_score: 100 },
    { ...games[0], visitor_team: team(4) },
  ]) {
    const v = view([...games, more])
    expect(
      v.series.find((s) => s.eventId === nbaSeriesEventId(season, 1, 2))
        ?.winnerId
    ).toBeNull()
    expect(v.champion).toBeNull()
  }
  expect(
    view([
      ...games,
      {
        ...games[0],
        home_team: { ...games[0].home_team, full_name: 'Different side' },
      },
    ]).champion
  ).toBeNull()
})
test('scheduled, postponed and canceled games never contribute scores; abnormal finals and a fifth win go to review', () => {
  const four = [1, 2, 3, 4].map((i) => game(i, 1, 2, i))
  for (const state of ['scheduled', 'postponed', 'canceled']) {
    const v = view([...four, { ...game(5, 2, 1, 8), status_state: state }])
    expect(v.series[0].wins).toEqual([4, 0])
    expect(v.series[0].winnerId).toBe(1)
  }
  for (const extras of [
    [{ ...four[3], id: 7, datetime: 'bad' }],
    [{ ...game(8, 1, 2, 8), status_state: 'mystery' }],
    [{ ...game(8, 1, 2, 8), home_team_score: 99 }],
    [{ ...game(8, 1, 2, 8), home_team_score: null }],
    [game(9, 1, 2, 8)],
  ]) {
    const v = view([...four, ...extras])
    expect(v.series[0].review.length).toBeGreaterThan(0)
    expect(v.series[0].winnerId).toBeNull()
  }
  expect(
    view([{ ...four[0], postseason: undefined }]).review.length
  ).toBeGreaterThan(0)
  expect(view([{ ...four[0], ist_stage: 'Final' }]).series).toEqual([])
  expect(view([{ ...four[0], postseason: false }]).series).toEqual([])
  expect(() => nbaSeriesEventId(2025, 1, 1)).toThrow()
  expect(() => nbaSeriesEventId(2025, Number.MAX_SAFE_INTEGER + 1, 2)).toThrow()
  expect(() => projectNbaPlayoffSeries(2000, [], true)).toThrow()
})
test('missing evidence, a returning loser, conflicting chronology and same-conference finals cannot declare a champion', () => {
  const g = completeBracket()
  const fallen = g.map((x) =>
    x.id < 33
      ? x
      : {
          ...x,
          home_team: x.home_team.id === 1 ? team(2) : x.home_team,
          visitor_team: x.visitor_team.id === 1 ? team(2) : x.visitor_team,
        }
  )
  const early = g.map((x) =>
    x.id === 33 ? { ...x, datetime: g[0].datetime } : x
  )
  const wrongConference = g.map((x) => ({
    ...x,
    home_team: { ...x.home_team, conference: 'East' },
    visitor_team: { ...x.visitor_team, conference: 'East' },
  }))
  for (const source of [fallen, early, wrongConference])
    expect(view(source).champion).toBeNull()
})
describe('gated whole-season reader', () => {
  const old = process.env
  const clock = {
    time: start,
    now() {
      return this.time
    },
    sleep: async (ms: number) => {
      clock.time += ms
    },
  }
  beforeEach(() => {
    process.env = {
      ...old,
      NEXT_PUBLIC_SPORTS_BDL_ENABLED: 'true',
      SPORTS_BDL_NBA_PLAYOFF_SERIES: 'true',
    }
    delete process.env.BDL_FIXTURE_DIR
    delete process.env.SPORTS_FAKE_NOW
  })
  afterEach(() => {
    process.env = old
  })
  const opts = (fn: (url: URL) => unknown) => ({
    clock,
    key: 'synthetic',
    role: 'scheduler' as const,
    transport: async (s: string) =>
      new Response(JSON.stringify(fn(new URL(s))), { status: 200 }),
  })
  test('uses the recorded season and exact opaque cursor until the final page; never counts regular games', async () => {
    const pages: string[] = []
    const options = opts((url) => {
      expect(url.pathname).toBe('/nba/v1/games')
      expect(url.searchParams.getAll('seasons[]')).toEqual(['2025'])
      const cursor = url.searchParams.get('cursor')
      pages.push(cursor ?? 'first')
      return cursor === null
        ? {
            data: [
              { ...game(700, 1, 2, 0), postseason: false },
              ...finals.slice(0, 2),
            ],
            meta: { next_cursor: 'abc' },
          }
        : { data: finals.slice(2), meta: { per_page: 100 } }
    })
    const v = await readNbaPlayoffSeason(2025, async () => true, options)
    expect(pages).toEqual(['first', 'abc'])
    expect(v?.series.find((s) => s.teams[0].id === 20)?.wins).toEqual([4, 1])
  })
  test('no access off or for unsupported seasons; a changed phase mid-page cannot publish a partial bracket', async () => {
    const transport = jest.fn(
      async () => new Response(JSON.stringify({ data: [], meta: {} }))
    )
    const phase = jest.fn(async () => true)
    for (const k of [
      'NEXT_PUBLIC_SPORTS_BDL_ENABLED',
      'SPORTS_BDL_NBA_PLAYOFF_SERIES',
    ]) {
      process.env[k] = 'false'
      expect(
        await readNbaPlayoffSeason(2025, phase, { clock, transport })
      ).toBeNull()
      process.env[k] = 'true'
    }
    expect(phase).not.toHaveBeenCalled()
    expect(
      await readNbaPlayoffSeason(2025, async () => false, { clock, transport })
    ).toBeNull()
    await expect(
      readNbaPlayoffSeason(1800, phase, { clock, transport })
    ).rejects.toThrow()
    expect(transport).not.toHaveBeenCalled()
    let enabled = true
    const page = opts(() => {
      enabled = false
      return { data: [], meta: { next_cursor: 5 } }
    })
    await expect(
      readNbaPlayoffSeason(2025, async () => enabled, page)
    ).rejects.toThrow()
  })
  test('repeated cursors, an ignored season filter and page-cap exhaustion cannot establish a season result', async () => {
    for (const page of [
      opts(() => ({ data: [], meta: { next_cursor: 1 } })),
      opts(() => ({ data: [{ ...game(1, 1, 2, 0), season: 2024 }] })),
      opts((url) => ({
        data: [],
        meta: { next_cursor: Number(url.searchParams.get('cursor') ?? 0) + 1 },
      })),
    ]) {
      await expect(
        readNbaPlayoffSeason(2025, async () => true, page)
      ).rejects.toThrow()
    }
  })
})
