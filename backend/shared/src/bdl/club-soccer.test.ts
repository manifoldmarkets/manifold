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
import { createBdlClient, type BdlParams } from '../balldontlie-client'

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
  status_detail: null,
  status_state: 'scheduled',
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
    options: { matches: (row: T) => boolean; maxPages: number }
  ): Promise<T[]> => {
    calls.push({ path, params })
    const response = (path.endsWith('/odds') ? odds : schedule) as T[]
    if (!response.every(options.matches))
      throw Error('Unexpected row for selector')
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
      hold: null,
    })
    await readClubOdds(api, league, slate!.matches, true)
    expect(api.calls).toEqual([
      { path: route + '/matches', params: { season, dates: [when] } },
      { path: route + '/odds', params: { match_ids: [402] } },
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
        ...next,
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
    updated_at: date,
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
    selectOpeningLine(decodeClubOdds(rows, r).get(402)!, game, at + 2000)
  expect(select([quote]).probs).toEqual([0.5, 1 / 3, 1 / 6])
  expect(
    select([
      quote,
      {
        ...quote,
        moneyline_draw_odds: null,
        updated_at: new Date(at + 1000).toISOString(),
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
  await expect(readClubOdds(api, 'epl', rows, true)).rejects.toThrow(
    'Unexpected row'
  )
  const other = decode([next], 'laliga').matches
  expect((await readClubOdds(api, 'epl', other, true))?.size).toBe(0)
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
