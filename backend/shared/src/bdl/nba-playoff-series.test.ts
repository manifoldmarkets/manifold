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
  const duplicate = view([...games, games[0]])
  expect(duplicate.series.map((s) => s.wins)).toEqual(
    view(games).series.map((s) => s.wins)
  )
  expect(duplicate.review).toContain(
    'Repeated provider game ID in the season listing'
  )
  expect(duplicate.champion).toBeNull()
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
  const fallenFinal = view(fallen).series.find(
    (s) => s.teams.some((t) => t.id === 2) && s.teams.some((t) => t.id === 9)
  )
  expect(fallenFinal).toMatchObject({
    winnerId: null,
    clinchingGameId: null,
    review: expect.arrayContaining([
      'Entrant advancement conflicts with the observed games',
    ]),
  })
  for (const source of [fallen, early, wrongConference])
    expect(view(source).champion).toBeNull()
})
test('excludes a disputed game from both tallies in either order and recovers from a corrected unique listing', () => {
  const four = [1, 2, 3, 4].map((i) => game(i, 1, 2, i))
  const contradictory = {
    ...four[3],
    home_team_score: 78,
    visitor_team_score: 90,
  }
  for (const rows of [
    [...four, contradictory],
    [contradictory, ...four].reverse(),
    [contradictory, ...four],
  ]) {
    expect(view(rows).series[0]).toMatchObject({
      wins: [3, 0],
      winnerId: null,
      clinchingGameId: null,
    })
    expect(view(rows).series[0].games.map((g) => g.id)).not.toContain(4)
  }
  expect(view(four).series[0]).toMatchObject({
    wins: [4, 0],
    winnerId: 1,
    clinchingGameId: 4,
  })
})
test('all sixteen opening entrants debut before second-round play, while ordinary round overlap is allowed', () => {
  const base = completeBracket()
  const shift = (begin: number, end: number, days: number, rows = base) =>
    rows.map((g) =>
      g.id >= begin && g.id <= end
        ? {
            ...g,
            datetime: new Date(
              Date.parse(g.datetime) + days * DAY_MS
            ).toISOString(),
          }
        : g
    )
  // Delay the 1/2 opening pair beyond the Western conference final, and all of its successors.
  const late = shift(
    57,
    60,
    50,
    shift(49, 52, 50, shift(33, 36, 50, shift(1, 4, 50)))
  )
  expect(view(late).champion).toBeNull()
  expect(view(late).review).toContain(
    'Opening entrants were not established before the second round'
  )
  const notYetPlayed = base
    .filter((g) => g.id <= 32 || (g.id >= 37 && g.id <= 40))
    .map((g) => (g.id <= 4 ? { ...g, status_state: 'scheduled' } : g))
  expect(view(notYetPlayed).review).toContain(
    'Opening entrants were not established before the second round'
  )
  const overlapping = base.map((g) =>
    g.id === 8
      ? { ...g, datetime: new Date(start + 11 * DAY_MS).toISOString() }
      : g
  )
  // Delay that pair's own successor past its clincher, while another second-round series begins on day 10.
  expect(view(shift(33, 36, 3, overlapping)).champion?.teamId).toBe(1)
})
test('holds impossible NBA regulation overlap for an entrant within and across pairs', () => {
  const base = completeBracket()
  const close = (
    source: typeof base,
    id: number,
    origin: number,
    minutes: number
  ) =>
    source.map((g) =>
      g.id === id
        ? {
            ...g,
            datetime: new Date(
              Date.parse(source.find((g) => g.id === origin)!.datetime) +
                minutes * 60000
            ).toISOString(),
          }
        : g
    )
  for (const cases of [
    [2, 1],
    [33, 4],
  ]) {
    const [id, prior] = cases
    const invalid = view(close(base, id, prior, 1 / 60))
    expect(invalid.champion).toBeNull()
    expect(
      invalid.series
        .filter((s) => s.games.some((g) => g.id === id || g.id === prior))
        .every(
          (s) =>
            s.winnerId === null &&
            s.review.includes(
              'Played NBA fixtures overlap for the same entrant'
            )
        )
    ).toBe(true)
  }
  expect(view(close(base, 2, 1, 48)).champion?.teamId).toBe(1)
  // An intervening suspended fixture does not shorten a previously completed
  // NBA game's minimum regulation duration for a third opponent.
  const overlapWindow = [
    game(100, 1, 2, 0),
    {
      ...game(101, 1, 3, 0),
      status_state: 'suspended',
      datetime: new Date(start + 15 * 60000).toISOString(),
    },
    {
      ...game(102, 1, 4, 0),
      datetime: new Date(start + 20 * 60000).toISOString(),
    },
  ]
  expect(
    view(overlapWindow).series.find((s) => s.teams[1].id === 4)?.review
  ).toContain('Played NBA fixtures overlap for the same entrant')
  const exceptional = view(
    base.map((g) => (g.id === 1 ? { ...g, status: 'Forfeit' } : g))
  )
  expect(exceptional.champion).toBeNull()
  expect(exceptional.series[0].wins).toEqual([3, 0])
})
test('earlier unresolved fixtures hold the clincher, while future conditionals and an explicit canceled game do not', () => {
  const four = [1, 2, 3, 4].map((i) => game(i, 1, 2, i))
  for (const state of ['scheduled', 'delayed', 'postponed']) {
    const pending = { ...game(9, 1, 2, 0), status_state: state }
    expect(view([...four, pending]).series[0]).toMatchObject({
      winnerId: null,
      clinchingGameId: null,
    })
    expect(
      view([...four, { ...pending, datetime: 'unknown' }]).series[0].winnerId
    ).toBeNull()
    expect(
      view([...four, { ...pending, datetime: game(9, 1, 2, 9).datetime }])
        .series[0].winnerId
    ).toBe(1)
  }
  expect(
    view([...four, { ...game(9, 1, 2, 0), status_state: 'canceled' }]).series[0]
      .winnerId
  ).toBe(1)
})
test('checks whole-season identity for playoff entrants, including clubs that never faced each other', () => {
  const base = completeBracket(),
    regular = { ...game(99, 1, 2, 0), postseason: false }
  for (const conflict of [
    { full_name: 'Another team' },
    { conference: 'West' },
  ]) {
    const changed = {
      ...regular,
      home_team: { ...regular.home_team, ...conflict },
    }
    for (const source of [
      [...base, changed],
      [changed, ...base],
    ]) {
      const b = view(source)
      expect(b.champion).toBeNull()
      expect(
        b.series
          .filter((s) => s.teams.some((t) => t.id === 1))
          .every(
            (s) =>
              s.review.includes('Conflicting entrant identity') &&
              s.winnerId === null
          )
      ).toBe(true)
    }
  }
  const shared = base.map((g) => ({
    ...g,
    home_team:
      g.home_team.id === 4
        ? { ...g.home_team, full_name: ' Club  2 ' }
        : g.home_team,
    visitor_team:
      g.visitor_team.id === 4
        ? { ...g.visitor_team, full_name: ' Club  2 ' }
        : g.visitor_team,
  }))
  const b = view(shared)
  expect(b.champion).toBeNull()
  expect(
    b.series
      .filter((s) => s.teams.some((t) => t.id === 2 || t.id === 4))
      .every((s) => s.review.includes('Conflicting entrant identity'))
  ).toBe(true)
  expect(view([...base, regular]).champion?.teamId).toBe(1)
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
            meta: { next_cursor: 'abc', per_page: 100 },
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
      return { data: [], meta: { next_cursor: 5, per_page: 100 } }
    })
    await expect(
      readNbaPlayoffSeason(2025, async () => enabled, page)
    ).rejects.toThrow()
  })
  test('malformed page metadata cannot certify a partial season, including a corrupted final page', async () => {
    for (const meta of [
      undefined,
      null,
      [],
      false,
      {},
      { per_page: 99 },
      { per_page: 100, next_cursor: {} },
      { per_page: 100, next_cursor: ' ' },
      { per_page: 100, prev_cursor: 'wrong' },
    ]) {
      const calls: string[] = []
      const options = opts((url) => {
        calls.push(url.searchParams.get('cursor') ?? 'initial')
        return calls.length === 1
          ? { data: finals, meta: { per_page: 100, next_cursor: 'tail' } }
          : { data: [], meta }
      })
      await expect(
        readNbaPlayoffSeason(2025, async () => true, options)
      ).rejects.toThrow(/NBA season/)
      expect(calls).toEqual(['initial', 'tail'])
    }
  })
  test('repeated cursors, an ignored season filter and page-cap exhaustion cannot establish a season result', async () => {
    for (const page of [
      opts(() => ({ data: [], meta: { next_cursor: 1, per_page: 100 } })),
      opts(() => ({
        data: [{ ...game(1, 1, 2, 0), season: 2024 }],
        meta: { per_page: 100 },
      })),
      opts((url) => ({
        data: [],
        meta: {
          next_cursor: Number(url.searchParams.get('cursor') ?? 0) + 1,
          per_page: 100,
        },
      })),
    ]) {
      await expect(
        readNbaPlayoffSeason(2025, async () => true, page)
      ).rejects.toThrow()
    }
  })
})
