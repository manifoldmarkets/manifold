import { readFileSync } from 'fs'
import { join } from 'path'
import { selectOpeningLine } from 'common/bdl/opening-line'
import { fetchMajorSnapshots } from './major-snapshots'
import { createBdlClient } from '../balldontlie-client'
import {
  fetchMajorGames,
  fetchMajorOdds,
  mapMajorGame,
  MajorLeague,
} from './major-games'
import { reviewedResult } from './major-result'

type Raw = Record<string, unknown>
type Page = { data: Raw[]; meta?: { next_cursor: number | null } }
const leagues: MajorLeague[] = ['nba', 'nhl', 'wnba', 'mlb', 'nfl']
function fixture(league: MajorLeague, kind: 'games' | 'odds'): Page {
  const file =
    kind === 'games'
      ? 'games__spec-major-slate.json'
      : 'odds__spec-major-moneyline.json'
  return JSON.parse(
    readFileSync(
      join(__dirname, '../../test/fixtures/bdl', league, file),
      'utf8'
    )
  )
}
// Each sport has its own score and entrant fields. Only the administrative description
// changes between controls; the NFL policy fixture is an eligible 2027 season.
it.each(leagues)(
  'reviews abnormal %s finals without interpreting individual plays',
  (league) => {
    const source = fixture(league, 'games').data[0]
    const raw = {
      ...source,
      status_state: 'final',
      season: 2027,
      status: 'Final',
      home_team_score: 4,
      visitor_team_score: 2,
      home_score: 4,
      away_score: 2,
      home_team_data: { runs: 4 },
      away_team_data: { runs: 2 },
    }
    const labels = [
      'Home team forfeits',
      'Home team forfeits, visitors advance',
      'Contest ended in a forfeit',
      'Forfeit loss',
      'Abandonment',
      'Game abandoned due to rain',
      'Game awarded to visitors',
      'Winner by forfeit',
      'STATUS_WALKOVER',
      'Walk-over',
      'Final (retirement)',
      'Away team retired',
      'Abandoned due to rain',
      mapMajorGame(league, raw).away.name + ' forfeit',
      'Result: No-contest',
    ]
    for (const field of ['status', 'summary', 'period_detail']) {
      for (const label of labels) {
        const decision = reviewedResult(
          league,
          mapMajorGame(league, { ...raw, [field]: label })
        )
        expect({ field, label, decision }).toEqual({
          field,
          label,
          decision: { incident: 'irregular result' },
        })
      }
    }
    if (league === 'nhl') {
      expect(
        reviewedResult(
          league,
          mapMajorGame(league, { ...raw, game_state: 'FORFEITED' })
        )
      ).toEqual({ incident: 'irregular result' })
    }
    for (const label of [
      'Final/OT',
      'Batter retired',
      'Runner retired at home',
      'Home team forfeits a timeout',
      'Away team awarded two free throws',
      'Penalty shot awarded',
      'Wins on a walk-off',
      'Jersey retirement ceremony',
    ]) {
      expect(
        reviewedResult(league, mapMajorGame(league, { ...raw, summary: label }))
          .record?.status
      ).toBe('final')
    }
    expect(
      reviewedResult(
        league,
        mapMajorGame(league, {
          ...raw,
          status_state: 'scheduled',
          status: 'Final',
        })
      ).record
    ).toBeUndefined()
  }
)

function localClient(
  response: (url: URL) => { data: unknown; meta?: Page['meta'] }
) {
  let now = 0
  const urls: URL[] = []
  const client = createBdlClient({
    role: 'recorder',
    key: 'test-only',
    clock: {
      now: () => now,
      sleep: async (ms) => {
        now += ms
      },
    },
    transport: async (input) => {
      const url = new URL(input)
      urls.push(url)
      return new Response(JSON.stringify(response(url)), { status: 200 })
    },
  })
  return { client, urls }
}
const dateFor = (league: MajorLeague) =>
  league === 'nfl' ? '2026-11-19' : '2026-05-14'

it.each(leagues)(
  'maps %s schedule and prices using league-specific fields and exact IDs',
  async (league) => {
    const { client, urls } = localClient((url) => {
      if (url.pathname.endsWith('/odds')) return fixture(league, 'odds')
      if (league === 'wnba' && url.searchParams.get('season_type') === '3')
        return { data: [] }
      return fixture(league, 'games')
    })
    const date = dateFor(league)
    const games = await fetchMajorGames(client, league, date, date)
    const game = games[0]
    expect(game).toMatchObject({
      id: { nba: 101, nhl: 201, wnba: 301, mlb: 402, nfl: 501 }[league],
      slateDate: date,
      home: { name: expect.stringMatching(/^Lake City/) },
      away: { name: expect.stringMatching(/^Northport/) },
      status: {
        nba: 'scheduled',
        nhl: 'in_progress',
        wnba: 'final',
        mlb: 'scheduled',
        nfl: 'final',
      }[league],
      homeScore: { nba: 0, nhl: 1, wnba: 84, mlb: 0, nfl: 24 }[league],
      awayScore: { nba: 0, nhl: 2, wnba: 78, mlb: 0, nfl: 24 }[league],
      eligible: true,
      postseason: league === 'nhl' || league === 'nba',
    })
    expect(urls[0].pathname).toBe('/' + league + '/v1/games')
    expect(urls[0].searchParams.getAll('dates[]')).toHaveLength(3)
    expect(urls[0].searchParams.get('per_page')).toBe('100')
    if (league === 'wnba')
      expect(urls.map((url) => url.searchParams.get('season_type'))).toEqual([
        '2',
        '3',
      ])
    if (league === 'nfl')
      expect(urls[0].searchParams.getAll('season_types[]')).toEqual(['2', '3'])
    if (league === 'nhl')
      expect(game).toMatchObject({ period: '3', clock: '05:21' })
    if (league === 'mlb') {
      expect(games.find((g) => g.id === 401)).toMatchObject({
        gameNumber: 1,
        status: 'suspended',
        period: '6',
        homeScore: 4,
        awayScore: 2,
      })
      expect(game.gameNumber).toBe(2)
    }
    const rows = await fetchMajorOdds(client, league, games)
    const last = urls[urls.length - 1]
    expect(last.pathname).toBe(
      '/' + league + (league === 'nba' ? '/v2/odds' : '/v1/odds')
    )
    expect(last.searchParams.getAll('game_ids[]')).toEqual(
      games.map((g) => String(g.id))
    )
    const quote = rows.get(game.id)![0]
    expect(quote).toMatchObject({
      eventId: 'bdl:' + league + ':' + game.id,
      outcomes: [
        {
          outcome: { entrantId: String(game.away.id) },
          americanOdds: league === 'nba' ? -150 : -175,
        },
        {
          outcome: { entrantId: String(game.home.id) },
          americanOdds: league === 'nba' ? 150 : 155,
        },
      ],
    })
    const line = selectOpeningLine(
      rows.get(game.id)!,
      {
        league,
        eventId: quote.eventId,
        entrantIds: [String(game.away.id), String(game.home.id)],
      },
      quote.updatedAtMs
    )
    expect(line.source).toBe(league === 'nba' ? 'kalshi' : 'books')
    if (league === 'mlb') expect(rows.get(401)).toEqual([])
  }
)

it('requests protected dates, follows real cursor pages and crops on Eastern kickoff at the window boundary', async () => {
  const row = fixture('nba', 'games').data[0]
  const { client, urls } = localClient((url) =>
    url.searchParams.has('cursor')
      ? {
          data: [
            {
              ...row,
              id: 104,
              date: '2026-05-14',
              datetime: '2026-05-15T03:59:59.000123Z',
            },
            {
              ...row,
              id: 105,
              date: '2026-05-15',
              datetime: '2026-05-15T04:00:00Z',
            },
          ],
        }
      : {
          data: [
            {
              ...row,
              id: 102,
              date: '2026-05-13',
              datetime: '2026-05-14T03:59:00Z',
            },
            { ...row, id: 103, date: '2026-05-14', datetime: null },
          ],
          meta: { next_cursor: 9 },
        }
  )
  const games = await fetchMajorGames(client, 'nba', '2026-05-14', '2026-05-14')
  expect(urls[0].searchParams.getAll('dates[]')).toEqual([
    '2026-05-13',
    '2026-05-14',
    '2026-05-15',
  ])
  expect(urls[1].searchParams.get('cursor')).toBe('9')
  expect(games.map((g) => [g.id, g.startTime])).toEqual([
    [103, null],
    [104, '2026-05-15T03:59:59.000Z'],
  ])
})

it('retains unknown lifecycle, excludes spring training, exhibitions and unknown opponents', async () => {
  const raw = fixture('mlb', 'games').data[0]
  const { client } = localClient(() => ({
    data: [
      { ...raw, id: 501, status_state: 'new_state' },
      { ...raw, id: 502, season_type: 'spring_training' },
      { ...raw, id: 503, season_type: undefined },
      {
        ...raw,
        id: 504,
        home_team: { id: 33, display_name: 'West All-Stars' },
      },
      { ...raw, id: 505, home_team: { id: 34, display_name: 'TBD' } },
    ].map((r, i) => ({ ...r, date: '2026-05-14T' + (16 + i) + ':00:00Z' })),
  }))
  const games = await fetchMajorGames(client, 'mlb', '2026-05-14', '2026-05-14')
  expect(games[0].status).toBe('unknown')
  expect(games.slice(1).map((g) => g.eligible)).toEqual([
    false,
    false,
    false,
    false,
  ])
})

it('leaves tied start times unnumbered and ineligible in MLB', async () => {
  const [row, second] = fixture('mlb', 'games').data
  const { client } = localClient(() => ({
    data: [row, { ...second, date: row.date }],
  }))
  const games = await fetchMajorGames(client, 'mlb', '2026-05-14', '2026-05-14')
  expect(games.map((g) => [g.eligible, g.gameNumber])).toEqual([
    [false, undefined],
    [false, undefined],
  ])
})

it('rejects unrelated dates, ignored WNBA phase, conflicting schedule IDs and unusable teams', async () => {
  const row = fixture('nba', 'games').data[0]
  const fetch = (data: Raw[]) =>
    fetchMajorGames(
      localClient(() => ({ data })).client,
      'nba',
      '2026-05-14',
      '2026-05-14'
    )
  await expect(fetch([{ ...row, date: '2026-05-01' }])).rejects.toThrow(
    'ignored the requested filter'
  )
  await expect(fetch([row, { ...row, home_team_score: 9 }])).rejects.toThrow(
    'Conflicting'
  )
  await expect(
    fetch([{ ...row, visitor_team: row.home_team }])
  ).rejects.toThrow('Both sides')
  await expect(
    fetch([{ ...row, home_team: { id: 11 } }])
  ).resolves.toMatchObject([
    { id: row.id, eligible: false, entrantIssue: 'unidentifiable entrants' },
  ])
  await expect(
    fetchMajorGames(
      localClient(() => fixture('wnba', 'games')).client,
      'wnba',
      '2026-05-14',
      '2026-05-14'
    )
  ).rejects.toThrow('ignored the requested filter')
})

it('batches 50 game IDs, preserves withdrawn quotes, rejects unrequested odds and skips empty slates', async () => {
  const schedule = localClient(() => fixture('nba', 'games'))
  const [g] = await fetchMajorGames(
    schedule.client,
    'nba',
    '2026-05-14',
    '2026-05-14'
  )
  const game = { ...g, id: 1 }
  const source = fixture('nba', 'odds').data[0]
  const quotes = localClient((url) => ({
    data: url.searchParams.getAll('game_ids[]').includes('1')
      ? [
          { ...source, game_id: 1, updated_at: '2026-05-13T13:59:00Z' },
          {
            ...source,
            game_id: 1,
            moneyline_home_odds: null,
            updated_at: '2026-05-13T14:00:00.000123Z',
          },
        ]
      : [],
  }))
  expect((await fetchMajorOdds(quotes.client, 'nba', [])).size).toBe(0)
  const games = Array.from({ length: 51 }, (_, i) => ({ ...game, id: i + 1 }))
  const map = await fetchMajorOdds(quotes.client, 'nba', games)
  expect(
    quotes.urls.map((u) => u.searchParams.getAll('game_ids[]').length)
  ).toEqual([50, 1])
  expect(map.size).toBe(51)
  const rows = map.get(1)!
  expect(rows[1].outcomes).toHaveLength(1)
  expect(
    selectOpeningLine(
      rows,
      { league: 'nba', eventId: 'bdl:nba:1', entrantIds: ['12', '11'] },
      rows[1].updatedAtMs
    ).source
  ).toBe('none')
  const bad = localClient(() => ({ data: [{ ...source, game_id: 999 }] }))
  await expect(fetchMajorOdds(bad.client, 'nba', [game])).rejects.toThrow(
    'ignored the requested filter'
  )
})

it('uses existing Odds team names only when an abbreviation and nickname identify the same team', async () => {
  const raw = fixture('nba', 'games').data[0]
  const { client } = localClient(() => ({
    data: [
      {
        ...raw,
        home_team: { id: 11, full_name: 'LA Clippers', abbreviation: 'LAC' },
        visitor_team: {
          id: 12,
          full_name: 'Northport Foxes',
          abbreviation: 'LAL',
        },
      },
    ],
  }))
  const [game] = await fetchMajorGames(
    client,
    'nba',
    '2026-05-14',
    '2026-05-14'
  )
  expect(game.home.name).toBe('Los Angeles Clippers')
  expect(game.away.name).toBe('Northport Foxes')
})

it('uses the normalized provider lifecycle exclusively and preserves missing scores', async () => {
  const states = [
    'scheduled',
    'in_progress',
    'final',
    'postponed',
    'canceled',
    'delayed',
    'suspended',
    'abandoned',
    'unknown',
  ]
  const raw = fixture('nba', 'games').data[0]
  const { client } = localClient(() => ({
    data: states.map((status_state, i) => ({
      ...raw,
      id: i + 1,
      status: 'Final',
      status_state,
      home_team_score: null,
      visitor_team_score: 0,
    })),
  }))
  const games = await fetchMajorGames(client, 'nba', '2026-05-14', '2026-05-14')
  expect(games.map((g) => g.status)).toEqual(states)
  expect(games.every((g) => g.homeScore === null && g.awayScore === 0)).toBe(
    true
  )
})

it('rejects invalid schedule dates and nonattributable quotes before price selection', async () => {
  const row = fixture('nba', 'games').data[0]
  const provider = localClient(() => ({ data: [row] }))
  await expect(
    fetchMajorGames(provider.client, 'nba', '2026-02-30', '2026-05-14')
  ).rejects.toThrow('date range')
  await expect(
    fetchMajorGames(provider.client, 'nba', '2026-05-15', '2026-05-14')
  ).rejects.toThrow('date range')
  expect(provider.urls).toHaveLength(0)
  const [game] = await fetchMajorGames(
    provider.client,
    'nba',
    '2026-05-14',
    '2026-05-14'
  )
  for (const fields of [{ vendor: '' }, { updated_at: 'yesterday' }]) {
    const odds = localClient(() => ({
      data: [{ ...fixture('nba', 'odds').data[0], ...fields }],
    }))
    await expect(fetchMajorOdds(odds.client, 'nba', [game])).rejects.toThrow(
      'vendor or timestamp'
    )
  }
})

it.each(['nba', 'nhl'] as const)(
  'labels only an unannounced scheduled %s civil date and does not invent a venue timezone',
  async (league) => {
    const raw = fixture(league, 'games').data[0]
    const time = league === 'nba' ? 'datetime' : 'start_time_utc'
    const civil = league === 'nba' ? 'date' : 'game_date'
    const source = {
      ...raw,
      status_state: 'scheduled',
      status: null,
      game_state: null,
      period: 0,
      [civil]: '2026-05-14',
    }
    const client = localClient(() => ({
      data: [
        { ...source, id: 1, [time]: null },
        { ...source, id: 2, [time]: undefined },
        { ...source, id: 3, [time]: '2026-05-99T20:00:00Z' },
        { ...source, id: 4, [time]: '' },
        { ...source, id: 5, [time]: '2026-05-14' },
        { ...source, id: 6, [time]: '2026-05-14T17:30:00Z' },
        { ...source, id: 7, [time]: null, status_state: 'in_progress' },
        { ...source, id: 8, [time]: '2026-05-15T15:00:00Z' },
        { ...source, id: 9, [time]: '2026-05-14T17:30:00Z', [civil]: null },
      ],
    })).client
    const games = await fetchMajorGames(
      client,
      league,
      '2026-05-14',
      '2026-05-15'
    )
    expect(games.map((game) => [game.id, game.dateOnly])).toEqual([
      [1, { date: '2026-05-14' }],
      [2, { date: '2026-05-14' }],
      [3, undefined],
      [4, undefined],
      [5, undefined],
      [6, undefined],
      [7, undefined],
      [8, undefined],
      [9, undefined],
    ])
    for (const invalidDate of [null, '2026-02-30', '2026-05-14T12:00:00Z']) {
      const bad = localClient(() => ({
        data: [{ ...source, [time]: null, [civil]: invalidDate }],
      })).client
      await expect(
        fetchMajorGames(bad, league, '2026-05-14', '2026-05-15')
      ).rejects.toThrow('no usable schedule date')
    }
  }
)

it('keeps contradictory NBA kickoff evidence unflagged and rejects conflicting duplicate date-only rows', async () => {
  const raw = { ...fixture('nba', 'games').data[0], datetime: null }
  const client = localClient(() => ({
    data: [{ ...raw, status: '2026-05-15T03:00:00Z' }],
  })).client
  const [unknown] = await fetchMajorGames(
    client,
    'nba',
    '2026-05-14',
    '2026-05-14'
  )
  expect(unknown).toMatchObject({ id: 101, startTime: null })
  expect(unknown.dateOnly).toBeUndefined()
  const repeated = localClient(() => ({ data: [raw, { ...raw }] })).client
  expect(
    await fetchMajorGames(repeated, 'nba', '2026-05-14', '2026-05-14')
  ).toHaveLength(1)
  const conflict = localClient(() => ({
    data: [raw, { ...raw, datetime: 'invalid' }],
  })).client
  await expect(
    fetchMajorGames(conflict, 'nba', '2026-05-14', '2026-05-14')
  ).rejects.toThrow('Conflicting schedule rows')
})

it.each(['mlb', 'wnba', 'nfl'] as const)(
  'retains a deficient %s datetime-only row for presence without turning it into a date-only market',
  async (league) => {
    const source = fixture(league, 'games').data[0]
    const day = dateFor(league)
    const partial = { ...source, date: day, status_state: 'scheduled' }
    const response =
      league === 'mlb' ? [partial, { ...source, id: 703 }] : [partial]
    const client = localClient((url) => ({
      data: url.searchParams.get('season_type') === '3' ? [] : response,
    })).client
    const games = await fetchMajorGames(client, league, day, day)
    expect(games[0]).toMatchObject({
      id: source.id,
      startTime: null,
      slateDate: day,
    })
    expect(games[0].dateOnly).toBeUndefined()
    if (league === 'mlb')
      expect(games.map((game) => [game.eligible, game.gameNumber])).toEqual([
        [false, undefined],
        [false, undefined],
      ])
  }
)

it('maps the recorded Celtics at Pistons final with home and visitor identities intact', async () => {
  const page: Page = JSON.parse(
    readFileSync(
      join(__dirname, '../../test/fixtures/bdl/nba/games__recorded-final.json'),
      'utf8'
    )
  )
  const { client, urls } = localClient(() => page)
  const games = await fetchMajorGames(client, 'nba', '2026-10-20', '2026-10-20')
  expect(urls.map((url) => url.pathname)).toEqual(['/nba/v1/games'])
  expect(games).toHaveLength(1)
  expect(games[0]).toMatchObject({
    id: 21717855,
    slateDate: '2026-10-20',
    startTime: '2026-10-20T19:00:00.000Z',
    status: 'final',
    season: 2026,
    period: '4',
    postseason: false,
    home: { id: 9, name: 'Detroit Pistons' },
    homeScore: 121,
    away: { id: 2, name: 'Boston Celtics' },
    awayScore: 113,
  })
})

it.each(leagues)(
  'reads exact %s events with the documented endpoint and only the participating standings',
  async (league) => {
    const raw = fixture(league, 'games').data[0]
    const id = Number(raw.id),
      season = Number(raw.season)
    const h = raw.home_team as Raw,
      a = (raw.away_team ?? raw.visitor_team) as Raw
    const record = (id: unknown, wins: number) => ({
      team: { id },
      season,
      wins,
      losses: 3,
      ties: 0,
      ot_losses: 2,
    })
    const { client, urls } = localClient((url) => {
      if (url.pathname.endsWith('standings')) {
        expect(url.searchParams.get('season')).toBe(String(season))
        return {
          data: [
            record(h.id, 10),
            record(a.id, 8),
            record(99999, 5),
            { ...record(h.id, 99), season: season - 1 },
          ],
        }
      }
      if (league === 'nhl') {
        expect(url.searchParams.getAll('game_ids[]')).toEqual([String(id)])
        return { data: [raw] }
      }
      expect(url.pathname.endsWith('/games/' + id)).toBe(true)
      return { data: raw }
    })
    const games = await fetchMajorSnapshots(client, league, [{ id }], {
      standings: true,
    })
    expect(games.get(id)).toMatchObject({
      id,
      detail: {
        standings: {
          home: {
            wins: 10,
            losses: 3,
            ...(league === 'nhl' && { overtimeLosses: 2 }),
            ...(league === 'nfl' && { ties: 0 }),
          },
          away: { wins: 8, losses: 3 },
        },
      },
    })
    expect(urls).toHaveLength(2)
  }
)

it('preserves line score gaps and actual zeros, falls back to the same moved ID and skips optional standings errors', async () => {
  const raw = fixture('nba', 'games').data[0]
  const row = {
    ...raw,
    home_q1: 0,
    visitor_q1: 19,
    home_q3: 22,
    visitor_q3: null,
  }
  const when = '2026-05-14T22:00:00Z'
  const { client, urls } = localClient((url) => {
    if (url.pathname.endsWith('/standings')) return { data: null }
    if (url.pathname.endsWith('/games/2'))
      return {
        data: {
          ...row,
          id: 2,
          date: '2026-05-18',
          datetime: '2026-05-18T22:00:00Z',
        },
      }
    return { data: [{ ...row, id: 1 }] }
  })
  const result = await fetchMajorSnapshots(
    client,
    'nba',
    [
      { id: 1, startTime: when },
      { id: 2, startTime: when },
    ],
    { standings: true }
  )
  expect(urls.map((url) => url.pathname)).toEqual([
    '/nba/v1/games',
    '/nba/v1/games/2',
    '/nba/v1/standings',
  ])
  expect(result.get(2)?.slateDate).toBe('2026-05-18')
  expect(result.get(1)?.detail).toEqual({
    periodScores: [
      { home: 0, away: 19 },
      { home: null, away: null },
      { home: 22, away: null },
    ],
  })
})

it('rejects incorrect detail identities and repeated IDs before sending a settlement candidate', async () => {
  const raw = fixture('nba', 'games').data[0]
  const { client } = localClient(() => ({ data: raw }))
  await expect(fetchMajorSnapshots(client, 'nba', [{ id: 9 }])).rejects.toThrow(
    'different game ID'
  )
  const nhl = fixture('nhl', 'games').data[0]
  const duplicate = localClient(() => ({ data: [nhl, nhl] })).client
  await expect(
    fetchMajorSnapshots(duplicate, 'nhl', [{ id: Number(nhl.id) }])
  ).rejects.toThrow('duplicate')
})
