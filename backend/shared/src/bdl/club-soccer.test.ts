import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { selectOpeningLine } from 'common/bdl/opening-line'
import {
  CLUB_LEAGUES,
  ClubLeague,
  clubRow,
  decodeClubOdds,
  decodeClubSlate,
} from './club-soccer'
import { readClubSlate, readClubOdds } from './club-soccer-feed'
import {
  createBdlClient,
  type BdlParams,
  type BdlPageTiming,
} from '../balldontlie-client'

const season = 2026,
  day = '2026-11-21',
  date = day + 'T14:00:00Z',
  at = Date.parse(date)
const teams = [
  { id: 11, name: 'Harbor Town' },
  { id: 22, name: 'Hill United' },
]
const final = {
  id: 401,
  season,
  date,
  home_team_id: 11,
  away_team_id: 22,
  status: 'STATUS_FULL_TIME',
  status_state: 'final',
  status_detail: 'FT',
  home_score: 2,
  away_score: 1,
  first_half_home_score: 1,
  first_half_away_score: 1,
  second_half_home_score: 1,
  second_half_away_score: 0,
}
const next = {
  ...final,
  id: 402,
  status: 'STATUS_SCHEDULED',
  status_detail: 'Sat, November 21st at 9:00 AM EST',
  status_state: 'scheduled',
  home_score: 0,
  away_score: 0,
  first_half_home_score: null,
  first_half_away_score: null,
  second_half_home_score: null,
  second_half_away_score: null,
}
const decode = (
  rows: unknown[],
  league: ClubLeague = 'epl',
  clubs: unknown[] = teams
) => decodeClubSlate(league, season, clubs, rows)
const recorded = (name: string): unknown[] =>
  JSON.parse(
    readFileSync(
      join(__dirname, '../../test/fixtures/bdl/epl/' + name + '.json'),
      'utf8'
    )
  ).data
const client = (
  schedule: unknown[],
  clubs: unknown[] = teams,
  odds: unknown[] = []
) => {
  const get = jest.fn(async (path: string, params: BdlParams = {}) => ({
    request: { path, params, at: date },
    body: { data: clubs },
    status: 200,
    rateLimit: { limit: null, remaining: null },
  }))
  const calls: { path: string; params: BdlParams }[] = []
  const getAll = async <T>(
    path: string,
    params: BdlParams,
    options: { matches: (row: T) => boolean; maxPages: number },
    timing?: BdlPageTiming<T>
  ): Promise<T[]> => {
    calls.push({ path, params })
    const response = (path.endsWith('/odds') ? odds : schedule) as T[]
    if (!response.every(options.matches))
      throw Error('Unexpected row for selector')
    if (timing) timing.onPage(response, timing.now())
    return response
  }
  return { get, getAll, calls }
}
const previous = process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED
beforeEach(() => {
  process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED = 'true'
})
afterEach(() => {
  if (previous === undefined) delete process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED
  else process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED = previous
})

it('joins four recorded EPL clubs and withholds a 2–2 total contradicted by its two halves', async () => {
  const api = client(
    recorded('matches__recorded-regulation'),
    recorded('teams__recorded-regulation')
  )
  const dates = recorded('matches__recorded-regulation').map((row) =>
    String(clubRow(row).date).slice(0, 10)
  )
  const slate = await readClubSlate(api, {
    league: 'epl',
    dates,
    season,
    enabled: true,
  })
  expect(slate?.matches.find((m) => m.id === 3818267)).toMatchObject({
    eventId: 'bdl:epl:3818267',
    home: { id: '17', name: 'Sunderland' },
    away: { id: '11', name: 'Leeds United' },
    score: { home: 0, away: 0 },
    hold: null,
    regulationResult: 'draw',
  })
  expect(slate?.matches.find((m) => m.id === 3818207)).toMatchObject({
    eventId: 'bdl:epl:3818207',
    home: { name: 'Everton' },
    away: { name: 'Manchester United' },
    score: { home: 2, away: 2 },
    halves: [
      { home: 0, away: 0 },
      { home: 1, away: 2 },
    ],
    hold: 'unverified-regulation',
    regulationResult: null,
  })
  expect(slate?.incomplete).toBe(false)
})

it.each(CLUB_LEAGUES)(
  'uses the %s versioned directory and paged match/odds selectors',
  async (league) => {
    const when = league === 'mls' ? '2026-09-01' : day
    const row = { ...next, date: when + 'T14:00:00Z' },
      api = client([row])
    const slate = await readClubSlate(api, {
      league,
      dates: [when, when],
      season,
      enabled: true,
    })
    const route = '/' + league + (league === 'epl' ? '/v2' : '/v1')
    expect(api.get).toHaveBeenCalledWith(route + '/teams', { season })
    expect(slate?.matches[0]).toMatchObject({
      eventId: 'bdl:' + league + ':402',
      hold: league === 'ucl' || league === 'mls' ? 'unverified-phase' : null,
    })
    await readClubOdds(api, league, slate!.matches, true, () =>
      Date.parse(when + 'T13:00Z')
    )
    expect(api.calls).toEqual([
      { path: route + '/matches', params: { season, dates: [when] } },
      ...(league === 'ucl' || league === 'mls'
        ? []
        : [{ path: route + '/odds', params: { match_ids: [402] } }]),
    ])
  }
)
it('returns no acquisition and makes zero requests without both explicit switches', async () => {
  const api = client([next]),
    rows = decode([next]).matches
  for (const [master, enabled] of [
    ['true', false],
    ['false', true],
    ['false', false],
  ] as const) {
    process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED = master
    expect(
      await readClubSlate(api, { league: 'epl', season, dates: [day], enabled })
    ).toBeNull()
    expect(await readClubOdds(api, 'epl', rows, enabled)).toBeNull()
  }
  expect(api.get).not.toHaveBeenCalled()
  expect(api.calls).toEqual([])
})
it('validates dates before a transport read and rejects a truncated team directory', async () => {
  const api = client([next])
  await expect(
    readClubSlate(api, {
      league: 'epl',
      season,
      dates: ['2026-02-30'],
      enabled: true,
    })
  ).rejects.toThrow('Invalid')
  expect(api.get).not.toHaveBeenCalled()
  const partial = {
    ...api,
    get: async () => ({
      ...(await api.get('test')),
      body: { data: teams, meta: { next_cursor: 5 } },
    }),
  }
  await expect(
    readClubSlate(partial, {
      league: 'epl',
      season,
      dates: [day],
      enabled: true,
    })
  ).rejects.toThrow('Incomplete')
  expect(api.calls).toEqual([])
})
it('preserves held and duplicated event IDs without claiming unrelated teams or poisoning an independent match', () => {
  const rows = decode([
    final,
    { ...next, home_team_id: null },
    { ...next, id: 403, away_team_id: 11 },
    { ...final, id: 404 },
    { ...final, id: 404, home_score: 7 },
    null,
  ])
  expect(rows.incomplete).toBe(true)
  expect(rows.matches.map((m) => [m.id, m.hold, m.regulationResult])).toEqual([
    [401, null, { winnerId: '11' }],
    [402, 'unverified-clubs', null],
    [403, 'unverified-clubs', null],
    [404, 'conflicting-rows', null],
  ])
  expect(decode([final, final]).matches).toHaveLength(1)
  expect(
    decode([final], 'epl', [...teams, { id: 11, name: 'Another club' }])
      .matches[0].hold
  ).toBe('unverified-clubs')
  const filtered = decodeClubSlate(
    'epl',
    season,
    teams,
    [
      final,
      { ...next, date: '2026-11-22T02:00:00Z' },
      { ...next, id: 403, season: 2025 },
    ],
    new Set([day])
  )
  expect(filtered.incomplete).toBe(true)
  expect(filtered.matches.map((m) => m.id)).toEqual([401])
})
it.each([
  ['epl', { first_half_home_score: null }, 'unverified-regulation'],
  ['epl', { home_score: -1 }, 'unverified-regulation'],
  ['epl', { away_score: 1.5 }, 'unverified-regulation'],
  ['epl', { first_half_away_score: 0 }, 'unverified-regulation'],
  ['epl', { status: 'STATUS_FINAL_AET' }, 'unverified-phase'],
  ['ucl', { status: 'STATUS_FINAL_PEN' }, 'unverified-phase'],
  ['epl', { status: 'STATUS_FORFEIT' }, 'unverified-phase'],
  ['epl', { status_state: 'in_progress' }, 'unverified-status'],
  [
    'epl',
    {
      status: 'STATUS_FIRST_HALF',
      status_state: 'scheduled',
      status_detail: null,
    },
    'unverified-status',
  ],
  ['ucl', { date: '2027-03-09T20:00:00Z' }, 'unverified-phase'],
  ['ucl', { round_number: 9 }, 'unverified-phase'],
  ['ucl', { round_number: -1 }, 'unverified-phase'],
  ['bundesliga', { round_number: 35 }, 'unverified-phase'],
  ['mls', {}, 'unverified-phase'],
  ['mls', { date: '2027-06-01T20:00:00Z', season: 2027 }, 'unverified-phase'],
] as const)(
  'holds %s %j as %s and emits no regulation result',
  (league, patch, reason) => {
    const match = { ...final, ...patch }
    const result = decodeClubSlate(league, match.season, teams, [match])
      .matches[0]
    expect(result.hold).toBe(reason)
    expect(result.regulationResult).toBeNull()
  }
)
it('awards the verified away club, and preserves partial halftime data without a result', () => {
  expect(
    decode([
      {
        ...final,
        home_score: 0,
        first_half_home_score: 0,
        second_half_home_score: 0,
      },
    ]).matches[0].regulationResult
  ).toEqual({ winnerId: '22' })
  expect(
    decode([
      {
        ...final,
        status: 'STATUS_SECOND_HALF',
        status_state: 'in_progress',
        status_detail: "55'",
        second_half_home_score: null,
      },
    ]).matches[0]
  ).toMatchObject({
    status: 'in_progress',
    statusDetail: "55'",
    halves: [{ home: 1, away: 1 }, null],
    regulationResult: null,
  })
})
it('keeps complete synthetic current prices in home/away/draw order and never revives a withdrawn quote', async () => {
  const rows = decode([next]).matches,
    match = rows[0]
  const quote = {
    match_id: 402,
    vendor: 'fixture-book',
    updated_at: new Date(at - 4000).toISOString(),
    moneyline_home_odds: 100,
    moneyline_away_odds: 200,
    moneyline_draw_odds: 500,
  }
  const game = {
    eventId: match.eventId,
    league: 'epl' as const,
    entrantIds: ['11', '22'] as const,
  }
  const select = (r: unknown[]) =>
    selectOpeningLine(
      decodeClubOdds(rows, r, at - 1000).get(402)!,
      game,
      at - 1000
    )
  expect(select([quote]).probs).toEqual([0.5, 1 / 3, 1 / 6])
  expect(
    select([
      quote,
      {
        ...quote,
        moneyline_draw_odds: null,
        updated_at: new Date(at - 2000).toISOString(),
      },
    ]).source
  ).toBe('none')
  expect(select([{ ...quote, match_id: 401 }]).source).toBe('none')
  expect(
    select([quote, { ...quote, updated_at: 'ambiguous date' }]).source
  ).toBe('none')
  expect(select([quote, { ...quote, moneyline_home_odds: -320 }]).source).toBe(
    'none'
  )
  const api = client([], teams, [{ ...quote, match_id: 401 }])
  await expect(
    readClubOdds(api, 'epl', rows, true, () => at - 1000)
  ).rejects.toThrow('Unexpected row')
  const other = decode([next], 'laliga').matches
  expect(
    (await readClubOdds(api, 'epl', other, true, () => at - 1000))?.size
  ).toBe(0)
})

it('replays the real P0 local transport and follows its opaque cursor without a network fallback', async () => {
  const root = mkdtempSync(join(tmpdir(), 'bdl-club-replay-')),
    dir = join(root, 'epl')
  mkdirSync(dir)
  const env = [
    'BDL_FIXTURE_DIR',
    'LOCAL_ONLY',
    'GOOGLE_CLOUD_PROJECT',
    'SPORTS_FAKE_NOW',
  ] as const
  const initial = env.map((name) => process.env[name])
  const rows = recorded('matches__recorded-regulation')
  const dates = rows.map((r) => String(clubRow(r).date).slice(0, 10))
  const files = [
    {
      name: 'teams__clubs',
      path: '/epl/v2/teams',
      params: { season },
      body: { data: recorded('teams__recorded-regulation') },
    },
    {
      name: 'matches__first',
      path: '/epl/v2/matches',
      params: { season, dates, per_page: 100 },
      body: { data: rows.slice(0, 1), meta: { next_cursor: 'next-page-b' } },
    },
    {
      name: 'matches__second',
      path: '/epl/v2/matches',
      params: { season, dates, per_page: 100, cursor: 'next-page-b' },
      body: { data: rows.slice(1), meta: { next_cursor: null } },
    },
  ]
  try {
    for (const f of files)
      writeFileSync(
        join(dir, f.name + '.json'),
        JSON.stringify({
          request: { path: f.path, params: f.params },
          status: 200,
          body: f.body,
        })
      )
    process.env.BDL_FIXTURE_DIR = root
    process.env.LOCAL_ONLY = 'true'
    delete process.env.GOOGLE_CLOUD_PROJECT
    delete process.env.SPORTS_FAKE_NOW
    const transport = jest.fn(() => {
      throw Error('unexpected transport')
    })
    const observed: BdlParams[] = []
    const local = createBdlClient({
      role: 'codex',
      transport,
      onAttempt: (a) => {
        observed.push(a.request.params)
      },
    })
    const snapshot = await readClubSlate(local, {
      league: 'epl',
      season,
      dates,
      enabled: true,
    })
    expect(snapshot?.matches.map((m) => m.id).sort()).toEqual([
      3818207, 3818267,
    ])
    expect(observed).toHaveLength(3)
    expect(observed[2].cursor).toBe('next-page-b')
    expect(transport).not.toHaveBeenCalled()
  } finally {
    for (const [i, name] of env.entries()) {
      if (initial[i] === undefined) delete process.env[name]
      else process.env[name] = initial[i]
    }
    for (const f of files) unlinkSync(join(dir, f.name + '.json'))
    rmdirSync(dir)
    rmdirSync(root)
  }
})

it.each([false, true])(
  'retains the ID and holds out-of-scope date or season duplicates in either order (reverse=%s)',
  (reverse) => {
    for (const change of [{ date: '2026-11-22T14:00:00Z' }, { season: 2025 }]) {
      const moved = { ...next, ...change, id: 401 }
      const rows = reverse ? [moved, final] : [final, moved]
      const slate = decodeClubSlate(
        'epl',
        season,
        teams,
        [...rows, { ...final, id: 403 }],
        new Set([day])
      )
      expect(slate.incomplete).toBe(true)
      expect(slate.matches).toEqual([
        expect.objectContaining({
          id: 401,
          season: null,
          hold: 'conflicting-rows',
          regulationResult: null,
        }),
        expect.objectContaining({
          id: 403,
          hold: null,
          regulationResult: { winnerId: '11' },
        }),
      ])
    }
  }
)

it.each(['ucl', 'mls'] as const)(
  'holds %s without a recorded stage discriminator, including a plausible round number',
  (league) => {
    for (const round_number of [null, 1, 8, 90]) {
      const r = {
        ...final,
        round_number,
        date: league === 'ucl' ? date : '2026-09-10T14:00:00Z',
      }
      expect(decode([r], league).matches[0]).toMatchObject({
        hold: 'unverified-phase',
        regulationResult: null,
      })
    }
  }
)

it.each([
  { status: null },
  { status: 'UNRECOGNIZED' },
  { status_detail: 'FT' },
  { status_detail: "45+1'" },
  { home_score: 1 },
  { away_score: -1 },
  { first_half_away_score: 0 },
  { second_half_home_score: 1 },
])('holds contradictory or unknown scheduled data %j', (patch) => {
  expect(decode([{ ...next, ...patch }]).matches[0]).toMatchObject({
    hold: 'unverified-status',
    regulationResult: null,
  })
})

it.each([
  'TBD',
  'TBA',
  'T.B.D.',
  'T. B. D .',
  'T. B. D.',
  'T B D',
  'N / A',
  'To  Be Determined',
  'To\tBe  Confirmed',
  'to be determined',
  'Winner of quarterfinal 2',
])(
  'keeps an unresolved %s opponent out of results and prices',
  async (name) => {
    const slate = decode([final, next], 'epl', [{ id: 11, name }, teams[1]])
    expect(slate.matches.map((m) => [m.hold, m.regulationResult])).toEqual([
      ['unverified-clubs', null],
      ['unverified-clubs', null],
    ])
    const api = client([])
    expect(
      (await readClubOdds(api, 'epl', slate.matches, true, () => at - 10))?.size
    ).toBe(0)
    expect(api.calls).toEqual([])
  }
)

it('identifies incomplete date batches even if the misplaced row matches a different requested day', async () => {
  const dates = Array.from(
    { length: 15 },
    (_, i) => '2026-11-' + String(i + 1).padStart(2, '0')
  )
  const late = { ...final, date: dates[14] + 'T14:00:00Z' }
  const api = client([late])
  const options = { league: 'epl' as const, season, dates, enabled: true }
  const both = await readClubSlate(api, options)
  expect(both).toMatchObject({
    incomplete: true,
    matches: [{ id: 401, hold: null }],
  })
  expect(api.calls.map((c) => c.params.dates)).toEqual([
    dates.slice(0, 14),
    dates.slice(14),
  ])
  const missed = {
    ...api,
    getAll: async <T>(_path: string, params: BdlParams): Promise<T[]> =>
      Array.isArray(params.dates) && params.dates.length === 14
        ? [late as T]
        : [],
  }
  expect(await readClubSlate(missed, options)).toMatchObject({
    incomplete: true,
    matches: [{ id: 401, hold: 'invalid-schedule', regulationResult: null }],
  })
})

it('requires a pre-kickoff acquisition and quote timestamp, including when retrieval crosses kickoff', async () => {
  const matches = decode([next]).matches
  const quote = {
    match_id: 402,
    vendor: 'book-a',
    updated_at: new Date(at - 5000).toISOString(),
    moneyline_home_odds: 120,
  }
  const before = client([], teams, [quote])
  expect(
    (await readClubOdds(before, 'epl', matches, true, () => at - 1))?.get(402)
  ).toHaveLength(1)
  for (const time of [at, at + 1]) {
    const already = client([], teams, [quote])
    expect(
      (await readClubOdds(already, 'epl', matches, true, () => time))?.size
    ).toBe(0)
    expect(already.calls).toHaveLength(0)
    const checks = [at - 1, at - 1, time, time]
    const crossing = client([], teams, [quote])
    expect(
      (
        await readClubOdds(
          crossing,
          'epl',
          matches,
          true,
          () => checks.shift()!
        )
      )?.get(402)
    ).toEqual([])
    expect(crossing.calls).toHaveLength(1)
    const stamped = client([], teams, [
      quote,
      { ...quote, updated_at: new Date(time).toISOString() },
    ])
    expect(
      (await readClubOdds(stamped, 'epl', matches, true, () => at - 1))?.get(
        402
      )
    ).toEqual([])
  }
})

it.each([false, true])(
  'isolates an undated quote to the identified vendor and never revives its earlier quote (reverse=%s)',
  (reverse) => {
    const matches = decode([next]).matches
    const quote = {
      match_id: 402,
      vendor: 'Book-A',
      updated_at: new Date(at - 5000).toISOString(),
      moneyline_home_odds: 100,
      moneyline_away_odds: 200,
      moneyline_draw_odds: 500,
    }
    const rows = [
      quote,
      { ...quote, vendor: ' BOOK-a ', updated_at: 'unknown' },
      { ...quote, vendor: 'Book-B' },
    ]
    if (reverse) rows.reverse()
    const offers = decodeClubOdds(matches, rows, at - 1).get(402)!
    expect(offers.map((q) => q.vendor)).toEqual(['book-b'])
    expect(
      selectOpeningLine(
        offers,
        {
          eventId: matches[0].eventId,
          league: 'epl',
          entrantIds: ['11', '22'],
        },
        at - 1
      ).vendors
    ).toEqual(['book-b'])
    expect(
      decodeClubOdds(
        matches,
        [...rows, { ...quote, vendor: null }],
        at - 1
      ).get(402)
    ).toEqual([])
  }
)

it.each([
  ['2026-11-21T16:00:00Z', 'Sat, November 21st at 9:00 AM EST'],
  ['2026-11-21T14:00:00Z', 'Fri, November 21st at 9:00 AM EST'],
  ['2026-11-21T14:00:00Z', 'Sat, November 22nd at 9:00 AM EST'],
  ['2026-11-21T14:00:00Z', 'Sat, November 21st at 9:01 AM EST'],
  ['2026-11-21T14:00:00Z', 'Sat, November 21st at 9:00 AM EDT'],
])(
  'does not request opening odds when the independent kickoff detail disagrees (%s, %s)',
  async (date, status_detail) => {
    const slate = decode([{ ...next, date, status_detail }])
    expect(slate.matches[0].hold).toBe('unverified-status')
    const api = client([])
    expect(
      (
        await readClubOdds(
          api,
          'epl',
          slate.matches,
          true,
          () => Date.parse(date) - 3600000
        )
      )?.size
    ).toBe(0)
    expect(api.calls).toHaveLength(0)
  }
)
it.each([
  ['2026-11-21T14:00:58Z', 'Sat, November 21st at 9:00 AM EST'],
  ['2026-10-12T04:05:15Z', 'Mon, October 12th at 12:05 AM EDT'],
  ['2026-10-13T03:59:59Z', 'Mon, October 12 at 11:59 PM EDT'],
])(
  'honors an agreeing local date and displayed minute across offsets and midnight (%s)',
  (date, status_detail) => {
    expect(
      decode([{ ...next, date, status_detail }]).matches[0].hold
    ).toBeNull()
  }
)
it('keeps a genuine club with dotted initials available for results and a pregame opening', async () => {
  const slate = decode([final, next], 'epl', [
    { id: 11, name: 'Hill T.B. Athletic' },
    teams[1],
  ])
  expect(slate.matches[0].regulationResult).toEqual({ winnerId: '11' })
  const api = client([])
  expect(
    (await readClubOdds(api, 'epl', slate.matches, true, () => at - 1))?.has(
      next.id
    )
  ).toBe(true)
  expect(api.calls).toHaveLength(1)
})

it.each([1, 50, 51])(
  'isolates future vendor stamps to their own successful odds batch (%i games)',
  async (size) => {
    const matches = decode(
      Array.from({ length: size }, (_, i) => ({ ...next, id: i + 1000 }))
    ).matches
    const start = at - 3600000
    let observed = start,
      calls = 0
    const transport = {
      ...client([]),
      getAll: async <T>(
        _path: string,
        params: BdlParams,
        _options: unknown,
        timing?: BdlPageTiming<T>
      ): Promise<T[]> => {
        calls++
        if (calls === 2) observed += 30000
        const ids = params.match_ids
        const rows = (
          Array.isArray(ids) && ids.includes(1000)
            ? [
                {
                  match_id: 1000,
                  vendor: 'book-a',
                  updated_at: new Date(start - 1000).toISOString(),
                  moneyline_home_odds: 100,
                },
                {
                  match_id: 1000,
                  vendor: 'book-a',
                  updated_at: new Date(start + 10000).toISOString(),
                  moneyline_home_odds: 100,
                },
                {
                  match_id: 1000,
                  vendor: 'book-b',
                  updated_at: new Date(start).toISOString(),
                  moneyline_home_odds: 100,
                },
              ]
            : []
        ) as T[]
        if (timing) timing.onPage(rows, timing.now())
        return rows
      },
    }
    const book = await readClubOdds(
      transport,
      'epl',
      matches,
      true,
      () => observed
    )
    expect(calls).toBe(Math.ceil(size / 50))
    expect(book?.get(1000)?.map((q) => q.vendor)).toEqual(['book-b'])
  }
)
it.each([
  [
    'checks kickoff again after all odds acquisition',
    [at - 5000, at - 4000, at - 3000, at],
  ],
  [
    'skips a reversed clock interval',
    [at - 5000, at - 4000, at - 5000, at - 1000],
  ],
] as const)('%s', async (_label, sample) => {
  const times: number[] = [...sample]
  const matches = decode([next]).matches
  const quote = {
    match_id: next.id,
    vendor: 'book-a',
    updated_at: new Date(at - 6000).toISOString(),
    moneyline_home_odds: 100,
  }
  const api = client([], teams, [quote])
  expect(
    (await readClubOdds(api, 'epl', matches, true, () => times.shift()!))?.get(
      next.id
    )
  ).toEqual([])
  expect(api.calls).toHaveLength(1)
})

const syntheticQuote = (match_id: number, when: number, vendor = 'book-a') => ({
  match_id,
  vendor,
  updated_at: new Date(when).toISOString(),
  moneyline_home_odds: 100,
  moneyline_away_odds: 200,
  moneyline_draw_odds: 500,
})
const opening = (
  quotes: Awaited<ReturnType<typeof readClubOdds>>,
  id: number,
  when: number
) =>
  selectOpeningLine(
    quotes?.get(id) ?? [],
    { eventId: 'bdl:epl:' + id, league: 'epl', entrantIds: ['11', '22'] },
    when
  )

it.each([false, true])(
  'uses each actual cursor page body receipt before delayed accounting and preserves vendor holds across pages (between-page clock retreats=%s)',
  async (retreat) => {
    const start = at - 120000
    let now = start
    const transport = jest.fn(async (url: string) => {
      const second = new URL(url).searchParams.get('cursor') === 'page-two'
      if (second) now = start + 20000
      const rows = second
        ? [
            syntheticQuote(next.id, now, 'book-a'),
            syntheticQuote(next.id, now, 'book-b'),
          ]
        : [syntheticQuote(next.id, start + 1000)]
      return new Response(
        JSON.stringify({
          data: rows,
          meta: { next_cursor: second ? null : 'page-two' },
        })
      )
    })
    // The real HTTP parser and bounded pagination run over a local response double.
    const source = createBdlClient({
      role: 'recorder',
      key: 'synthetic-reader',
      recorderRate: 60000,
      transport,
      clock: {
        now: () => now,
        sleep: async (ms) => {
          now += ms
        },
      },
      onAttempt: async () => {
        now =
          retreat && transport.mock.calls.length === 1
            ? start - 1000
            : now + 20000
      },
    })
    const rows = await readClubOdds(
      source,
      'epl',
      decode([next]).matches,
      true,
      () => now
    )
    expect(transport).toHaveBeenCalledTimes(2)
    const expected = retreat ? [] : ['book-b']
    expect(rows?.get(next.id)?.map((r) => r.vendor)).toEqual(expected)
    expect(opening(rows, next.id, now).vendors).toEqual(expected)
  }
)

it.each([
  ['second batch start', [1, 2, 3, 1, 5, 6]],
  ['second batch receipt', [1, 2, 3, 4, 2, 6]],
  ['second batch nonfinite', [1, 2, 3, 4, NaN, 6]],
  ['nonfinite batch start', [1, 2, 3, NaN, 5, 6]],
  ['return retreats', [1, 2, 3, 4, 5, 2]],
  ['return is nonfinite', [1, 2, 3, 4, 5, Infinity]],
] as const)(
  'withholds every prior opening if the %s clock is invalid',
  async (_name, offsets) => {
    const base = at - 60000
    const matches = decode(
      Array.from({ length: 51 }, (_, i) => ({ ...next, id: 1000 + i }))
    ).matches
    const quotes = await readClubOdds(
      {
        ...client([]),
        getAll: async <T>(
          _path: string,
          params: BdlParams,
          _options: unknown,
          timing?: BdlPageTiming<T>
        ) => {
          const ids = params.match_ids
          const rows = (
            Array.isArray(ids) && ids.includes(1000)
              ? [syntheticQuote(1000, base)]
              : []
          ) as T[]
          if (timing) timing.onPage(rows, timing.now())
          return rows
        },
      },
      'epl',
      matches,
      true,
      (() => {
        let i = 0
        return () => base + offsets[i++]
      })()
    )
    expect(quotes?.get(1000)).toEqual([])
    expect(opening(quotes, 1000, base + 10).source).toBe('none')
  }
)

it('keeps a withdrawal authoritative when the final clock retreats between the two vendor updates', async () => {
  const start = at - 60000,
    tick = [start, start, start + 10000, start + 5000]
  const offer = syntheticQuote(next.id, start)
  const api = client([], teams, [
    offer,
    { ...syntheticQuote(next.id, start + 8000), moneyline_away_odds: null },
  ])
  const result = await readClubOdds(
    api,
    'epl',
    decode([next]).matches,
    true,
    () => tick.shift()!
  )
  expect(result?.get(next.id)).toEqual([])
  expect(opening(result, next.id, start + 5000).source).toBe('none')
})

it.each([false, true])(
  'deduplicates identical events and quarantines conflicting or held copies across the batch boundary (reverse=%s)',
  async (reverse) => {
    const start = at - 60000
    const matches = decode(
      Array.from({ length: 50 }, (_, i) => ({ ...next, id: 1000 + i }))
    ).matches
    async function read(copy: (typeof matches)[number]) {
      const requested: number[][] = []
      const api = {
        ...client([]),
        getAll: async <T>(
          _p: string,
          params: BdlParams,
          _o: unknown,
          timing?: BdlPageTiming<T>
        ) => {
          const ids = params.match_ids as number[]
          requested.push(ids)
          const rows = ids.map((id) => syntheticQuote(id, start)) as T[]
          if (timing) timing.onPage(rows, timing.now())
          return rows
        },
      }
      const input = [...matches, copy]
      const result = await readClubOdds(
        api,
        'epl',
        reverse ? input.reverse() : input,
        true,
        () => start
      )
      expect(requested).toHaveLength(1)
      expect(opening(result, 1001, start).source).toBe('books')
      return {
        ids: requested.flat(),
        selection: opening(result, 1000, start).source,
        rows: result?.get(1000),
      }
    }
    const same = await read({ ...matches[0] })
    expect(same.ids.filter((id) => id === 1000)).toHaveLength(1)
    expect(same.selection).toBe('books')
    for (const conflicting of [
      { ...matches[0], away: matches[0].home, home: matches[0].away },
      { ...matches[0], hold: 'unverified-clubs' as const },
      { ...matches[0], startTime: new Date(at + 3600000).toISOString() },
    ]) {
      const held = await read(conflicting)
      expect(held.ids).not.toContain(1000)
      expect(held.rows ?? []).toEqual([])
      expect(held.selection).toBe('none')
    }
  }
)

it('withholds offers when a transport cannot confirm the page receipt', async () => {
  const when = at - 60000
  const rows = await readClubOdds(
    {
      ...client([]),
      getAll: async <T>() => [syntheticQuote(next.id, when)] as T[],
    },
    'epl',
    decode([next]).matches,
    true,
    () => when
  )
  expect(rows?.get(next.id)).toEqual([])
  expect(opening(rows, next.id, when).source).toBe('none')
})
