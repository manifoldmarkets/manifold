import { readFileSync } from 'fs'
import { join } from 'path'
import { selectOpeningLine } from 'common/bdl/opening-line'
import { createBdlClient } from '../balldontlie-client'
import { fetchMajorGames, fetchMajorOdds, MajorLeague } from './major-games'

type Raw = Record<string, unknown>
type Page = { data: Raw[]; meta?: { next_cursor: number | null } }
const leagues: MajorLeague[] = ['nba', 'nhl', 'wnba', 'mlb', 'nfl']
// Expected public schedule identity and scores for each trimmed response.
const schedules = {
  nba: {
    id: 21718156,
    slateDate: '2026-11-21',
    status: 'scheduled',
    home: { id: 23, name: 'Philadelphia 76ers' },
    away: { id: 17, name: 'Milwaukee Bucks' },
    homeScore: 0,
    awayScore: 0,
    postseason: false,
    eligible: true,
  },
  nhl: {
    id: 201,
    slateDate: '2026-05-14',
    status: 'in_progress',
    home: { id: 21, name: 'Lake City Waves' },
    away: { id: 22, name: 'Northport Bears' },
    homeScore: 1,
    awayScore: 2,
    postseason: true,
    eligible: true,
  },
  wnba: {
    id: 301,
    slateDate: '2026-05-14',
    status: 'final',
    home: { id: 31, name: 'Lake City Herons' },
    away: { id: 32, name: 'Northport Comets' },
    homeScore: 84,
    awayScore: 78,
    postseason: false,
    eligible: true,
  },
  mlb: {
    id: 402,
    slateDate: '2026-05-14',
    status: 'scheduled',
    home: { id: 41, name: 'Lake City Cranes' },
    away: { id: 42, name: 'Northport Oaks' },
    homeScore: 0,
    awayScore: 0,
    postseason: false,
    eligible: true,
  },
  nfl: {
    id: 501,
    slateDate: '2026-11-19',
    status: 'final',
    home: { id: 51, name: 'Lake City Wolves' },
    away: { id: 52, name: 'Northport Bobcats' },
    homeScore: 24,
    awayScore: 24,
    postseason: false,
    eligible: true,
  },
} as const
const recordedSchedules: MajorLeague[] = ['nba']
const recordedOdds: MajorLeague[] = []
function fixture(league: MajorLeague, kind: 'games' | 'odds'): Page {
  const file =
    kind === 'games'
      ? recordedSchedules.includes(league)
        ? 'games__recorded-major-slate.json'
        : 'games__spec-major-slate.json'
      : recordedOdds.includes(league)
      ? 'odds__recorded-synthetic-moneyline.json'
      : 'odds__spec-major-moneyline.json'
  return JSON.parse(
    readFileSync(
      join(__dirname, '../../test/fixtures/bdl', league, file),
      'utf8'
    )
  )
}
function mayNbaGame(): Raw {
  return {
    ...fixture('nba', 'games').data[0],
    id: 101,
    date: '2026-05-14',
    datetime: '2026-05-15T02:30:00Z',
    status: null,
    status_state: 'scheduled',
  }
}
function localClient(response: (url: URL) => Page) {
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
const dateFor = (league: MajorLeague) => schedules[league].slateDate

it.each(leagues)(
  'maps the %s schedule, filter and entrant identity',
  async (league) => {
    const { client, urls } = localClient((url) =>
      league === 'wnba' && url.searchParams.get('season_type') === '3'
        ? { data: [] }
        : fixture(league, 'games')
    )
    const day = dateFor(league)
    const games = await fetchMajorGames(client, league, day, day)
    expect(games[0]).toMatchObject(schedules[league])
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
      expect(games[0]).toMatchObject({ period: '3', clock: '05:21' })
  }
)

it.each(leagues)(
  'maps %s current prices to the requested game and its two entrants',
  async (league) => {
    const page = fixture(league, 'odds')
    const { client, urls } = localClient((url) =>
      url.pathname.endsWith('/odds')
        ? page
        : league === 'wnba' && url.searchParams.get('season_type') === '3'
        ? { data: [] }
        : fixture(league, 'games')
    )
    const day = dateFor(league)
    const [match] = await fetchMajorGames(client, league, day, day)
    // Price-only spec examples use fictional game IDs. Recorded game and odds IDs must match unchanged.
    const game = recordedOdds.includes(league)
      ? match
      : { ...match, id: Number(page.data[0].game_id) }
    const prices = await fetchMajorOdds(client, league, [game])
    const url = urls[urls.length - 1]
    expect(url.pathname).toBe(
      '/' + league + (league === 'nba' ? '/v2/odds' : '/v1/odds')
    )
    expect(url.searchParams.getAll('game_ids[]')).toEqual([String(game.id)])
    const quote = prices.get(game.id)![0]
    expect(quote).toMatchObject({
      eventId: 'bdl:' + league + ':' + game.id,
      outcomes: [
        {
          outcome: { entrantId: String(game.away.id) },
          americanOdds: page.data[0].moneyline_away_odds,
        },
        {
          outcome: { entrantId: String(game.home.id) },
          americanOdds: page.data[0].moneyline_home_odds,
        },
      ],
    })
    const line = selectOpeningLine(
      [quote],
      {
        league,
        eventId: quote.eventId,
        entrantIds: [String(game.away.id), String(game.home.id)],
      },
      quote.updatedAtMs
    )
    expect(line.source).toBe(league === 'nba' ? 'kalshi' : 'books')
    expect(line.probs[0]).toBeGreaterThan(line.probs[1])
  }
)

it('requests protected dates, follows real cursor pages and crops on Eastern kickoff at the window boundary', async () => {
  const row = mayNbaGame()
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

it('retains the suspended first game and the second game of a doubleheader', async () => {
  const provider = localClient((url) =>
    url.pathname.endsWith('/odds')
      ? fixture('mlb', 'odds')
      : fixture('mlb', 'games')
  ).client
  const games = await fetchMajorGames(
    provider,
    'mlb',
    '2026-05-14',
    '2026-05-14'
  )
  expect(games[0].gameNumber).toBe(2)
  expect(games[1]).toMatchObject({
    id: 401,
    gameNumber: 1,
    status: 'suspended',
    period: '6',
    homeScore: 4,
    awayScore: 2,
  })
  expect((await fetchMajorOdds(provider, 'mlb', games)).get(401)).toEqual([])
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
  const row = mayNbaGame()
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
  await expect(fetch([{ ...row, home_team: { id: 11 } }])).rejects.toThrow(
    'identifiable team'
  )
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
  const schedule = localClient(() => ({ data: [mayNbaGame()] }))
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
      {
        league: 'nba',
        eventId: 'bdl:nba:1',
        entrantIds: [String(game.away.id), String(game.home.id)],
      },
      rows[1].updatedAtMs
    ).source
  ).toBe('none')
  const bad = localClient(() => ({ data: [{ ...source, game_id: 999 }] }))
  await expect(fetchMajorOdds(bad.client, 'nba', [game])).rejects.toThrow(
    'ignored the requested filter'
  )
})

it('uses existing Odds team names only when an abbreviation and nickname identify the same team', async () => {
  const raw = mayNbaGame()
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
  const raw = mayNbaGame()
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
  const row = mayNbaGame()
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
  const raw = { ...mayNbaGame(), datetime: null }
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
