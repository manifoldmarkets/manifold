import { collegeGame } from 'common/bdl/college-games'
import { readCollegeSlate } from './college-slate'
import { createBdlClient } from '../balldontlie-client'
import {
  identifyCollegeTeams,
  readCollegeApPoll,
  readCollegeBracket,
  readCollegeGames,
} from './college-schedule'

const season = 2027,
  day = '2027-11-20'
const base = {
  id: 101,
  season,
  week: 3,
  date: '2027-11-21T01:00:00Z',
  status_state: 'scheduled',
  home_team: { id: 5, full_name: 'Harbor South' },
  visitor_team: { id: 7, full_name: 'West Bluff' },
}
function fixture(reply: (url: URL) => unknown) {
  const urls: URL[] = []
  let now = 0
  const client = createBdlClient({
    role: 'recorder',
    key: 'test-only',
    clock: {
      now: () => now,
      sleep: async (d) => {
        now += d
      },
    },
    transport: async (value) => {
      const url = new URL(value)
      urls.push(url)
      return new Response(JSON.stringify(reply(url)))
    },
  })
  return { client, urls }
}
it.each(['ncaaf', 'ncaab', 'ncaaw', 'cbb'] as const)(
  'pages the %s schedule, captures a UTC-next-day start and excludes the adjacent slate',
  async (league) => {
    const { client, urls } = fixture((url) =>
      url.searchParams.has('cursor')
        ? { data: [{ ...base, id: 102, date: '2027-11-21T21:00:00Z' }] }
        : { data: [base], meta: { next_cursor: 8 } }
    )
    const games = await readCollegeGames(client, league, season, day, day)
    expect(games.map((g) => g.eventId)).toEqual(['bdl:' + league + ':101'])
    expect(urls).toHaveLength(2)
    expect(urls[0].pathname).toBe('/' + league + '/v1/games')
    expect(urls[0].searchParams.getAll('dates[]')).toEqual([day, '2027-11-21'])
    expect(urls[0].searchParams.getAll('seasons[]')).toEqual(['2027'])
  }
)
it('rejects ignored filters, contradictory rows and an invalid request without visiting a provider', async () => {
  await expect(
    readCollegeGames(
      fixture(() => ({ data: [{ ...base, season: 2026 }] })).client,
      'ncaaf',
      season,
      day,
      day
    )
  ).rejects.toThrow('filter')
  await expect(
    readCollegeGames(
      fixture(() => ({ data: [{ ...base, date: '2027-11-01' }] })).client,
      'ncaab',
      season,
      day,
      day
    )
  ).rejects.toThrow('filter')
  await expect(
    readCollegeGames(
      fixture(() => ({
        data: [
          base,
          {
            ...base,
            home_team: base.visitor_team,
            visitor_team: base.home_team,
          },
        ],
      })).client,
      'ncaab',
      season,
      day,
      day
    )
  ).rejects.toThrow('Conflicting')
  const { client, urls } = fixture(() => ({ data: [] }))
  await expect(
    readCollegeGames(client, 'ncaab', season, day, '2027-12-20')
  ).rejects.toThrow('configured 14-day window')
  await expect(
    readCollegeGames(client, 'ncaab', season, day, '2027-02-31')
  ).rejects.toThrow('Invalid')
  expect(urls).toHaveLength(0)
})
it('uses unpaged football AP rankings, paged basketball polls and the checked bracket season', async () => {
  const record = { season, week: 3, team: { id: 5 }, rank: 1 }
  const football = fixture(() => ({ data: [record] }))
  expect([
    ...(await readCollegeApPoll(football.client, 'ncaaf', season, 3)).ranks,
  ]).toEqual([[5, 1]])
  expect(football.urls[0].searchParams.has('per_page')).toBe(false)
  await expect(
    readCollegeApPoll(
      fixture(() => ({ data: [record], meta: { next_cursor: 5 } })).client,
      'ncaaf',
      season,
      3
    )
  ).rejects.toThrow('Incomplete')
  for (const league of ['ncaab', 'ncaaw'] as const) {
    const hoops = fixture((url) =>
      url.searchParams.has('cursor')
        ? { data: [{ ...record, poll: 'ap' }] }
        : {
            data: [{ ...record, poll: 'coach', team: { id: 8 } }],
            meta: { next_cursor: 3 },
          }
    )
    expect([
      ...(await readCollegeApPoll(hoops.client, league, season, 3)).ranks,
    ]).toEqual([[5, 1]])
    expect(hoops.urls).toHaveLength(2)
    expect(
      (
        await readCollegeBracket(
          fixture(() => ({ data: [] })).client,
          league,
          season,
          []
        )
      ).rounds
    ).toEqual([])
    await expect(
      readCollegeBracket(
        fixture(() => ({ data: [{ season: 2026 }] })).client,
        league,
        season,
        []
      )
    ).rejects.toThrow('filter')
  }
})
it('reports each unmatched identity once and never merges different leagues', async () => {
  const game = collegeGame('ncaaf', base),
    notice = jest.fn(async () => undefined)
  expect([
    ...(await identifyCollegeTeams(
      'ncaaf',
      [game, game],
      ['Harbor South'],
      new Map(),
      notice
    )),
  ]).toEqual([[5, 'Harbor South']])
  expect(notice.mock.calls).toHaveLength(1)
  expect(notice).toHaveBeenCalledWith({
    league: 'ncaaf',
    id: 7,
    name: 'West Bluff',
  })
  await expect(
    identifyCollegeTeams('ncaab', [game], [], new Map(), notice)
  ).rejects.toThrow('one league')
})
it('returns AP badge data only for an identifiable game in the authorized sporting window', async () => {
  const previous = process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED
  try {
    const { client, urls } = fixture(() => ({ data: [base] })),
      reportUnmatched = jest.fn(async () => undefined)
    const policy = {
      league: 'ncaaf' as const,
      season,
      regularSeasonStart: '2027-08-01',
      regularSeasonEnd: '2027-12-01',
      playoffGameIds: new Set<number>(),
      tournamentStartByConference: new Map<string, string>(),
      poll: {
        league: 'ncaaf' as const,
        season,
        week: 3,
        ranks: new Map([[5, 25]]),
      },
    }
    const options = {
      client,
      leagueEnabled: true,
      policy,
      from: day,
      to: day,
      canonicalNames: ['Harbor South', 'West Bluff'],
      knownNames: new Map<number, string>(),
      reportUnmatched,
    }
    delete process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED
    expect(await readCollegeSlate(options)).toEqual([])
    process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED = 'true'
    expect(
      await readCollegeSlate({ ...options, leagueEnabled: false })
    ).toEqual([])
    expect(
      await readCollegeSlate({
        ...options,
        policy: { ...policy, league: 'cbb' },
      })
    ).toEqual([])
    expect(
      await readCollegeSlate({
        ...options,
        policy: { ...policy, season: 2026 },
      })
    ).toEqual([])
    expect(urls).toHaveLength(0)
    expect(await readCollegeSlate(options)).toEqual([
      expect.objectContaining({
        homeName: 'Harbor South',
        awayName: 'West Bluff',
        homeApRank: 25,
        awayApRank: null,
        scope: 'ranked-regular-season',
      }),
    ])
    expect(
      await readCollegeSlate({ ...options, canonicalNames: ['Harbor South'] })
    ).toEqual([])
    expect(reportUnmatched).toHaveBeenCalledWith({
      league: 'ncaaf',
      id: 7,
      name: 'West Bluff',
    })
  } finally {
    if (previous === undefined)
      delete process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED
    else process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED = previous
  }
})
it('uses the verified tournament join only while the current game still matches the bracket', async () => {
  const saved = process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED
  try {
    process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED = 'true'
    const league = 'ncaab' as const
    const source = collegeGame(league, base)
    const bracket = await readCollegeBracket(
      fixture(() => ({
        data: [
          {
            ...base,
            round: 0,
            bracket_location: 1,
            game_id: base.id,
            away_team: base.visitor_team,
          },
        ],
      })).client,
      league,
      season,
      [source]
    )
    const policy = {
      league,
      season,
      regularSeasonStart: null,
      regularSeasonEnd: null,
      tournamentStartByConference: new Map<string, string>(),
      playoffGameIds: new Set<number>(),
      poll: null,
    }
    const options = {
      leagueEnabled: true,
      policy,
      from: day,
      to: day,
      canonicalNames: ['Harbor South', 'West Bluff', 'Skyline'],
      knownNames: new Map<number, string>(),
      reportUnmatched: async () => {},
      bracket,
    }
    for (const [data, eligible] of [
      [base, true],
      [{ ...base, date: '2027-11-20T23:30Z' }, false],
      [{ ...base, visitor_team: { id: 9, full_name: 'Skyline' } }, false],
      [{ ...base, status_state: 'postponed' }, false],
    ] as const) {
      const slate = await readCollegeSlate({
        ...options,
        client: fixture(() => ({ data: [data] })).client,
      })
      expect(slate.map((s) => s.scope)).toEqual(
        eligible ? ['march-madness'] : []
      )
    }
  } finally {
    if (saved === undefined) delete process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED
    else process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED = saved
  }
})
it('sends zero provider calls through the ordinary service client with all college leagues off', async () => {
  const transport = jest.fn(async () => new Response('{}'))
  const client = createBdlClient({ role: 'api', transport })
  for (const league of ['ncaaf', 'ncaab', 'ncaaw', 'cbb'] as const)
    await expect(
      readCollegeGames(client, league, season, day, day)
    ).rejects.toThrow()
  expect(transport).not.toHaveBeenCalled()
})

it('rejects a reschedule crossing the Eastern slate boundary in either page order', async () => {
  const moved = { ...base, date: '2027-11-21T22:00:00Z' }
  for (const pages of [
    [base, moved],
    [moved, base],
  ]) {
    const { client } = fixture((url) =>
      url.searchParams.has('cursor')
        ? { data: [pages[1]] }
        : { data: [pages[0]], meta: { next_cursor: 1 } }
    )
    await expect(
      readCollegeGames(client, 'ncaab', season, day, day)
    ).rejects.toThrow('Conflicting observations')
  }
})
it('uses the recorded UTC selector for a late Pacific game on the Eastern slate', async () => {
  const night = { ...base, date: '2027-11-19T22:00:00-08:00' }
  const { client, urls } = fixture((url) => ({
    data: url.searchParams.getAll('dates[]').includes('2027-11-20')
      ? [night]
      : [],
  }))
  expect(
    (await readCollegeGames(client, 'ncaab', season, day, day))[0].slateDate
  ).toBe(day)
  expect(urls[0].searchParams.getAll('dates[]')).toEqual([day, '2027-11-21'])
  expect(
    await readCollegeGames(client, 'ncaab', season, '2027-11-19', '2027-11-19')
  ).toEqual([])
})
it('reports numeric IDs for missing names while keeping the incomplete entrant ineligible', async () => {
  for (const rawName of ['  ', 'TBD', null]) {
    const g = collegeGame('ncaab', {
      ...base,
      home_team: { id: 5, full_name: rawName },
    })
    expect(g.home).toBeNull()
    const report = jest.fn(async () => undefined)
    const mapped = await identifyCollegeTeams(
      'ncaab',
      [g, g],
      ['Harbor South', 'West Bluff'],
      new Map([[5, 'Harbor South']]),
      report
    )
    expect(report.mock.calls).toEqual([
      [{ league: 'ncaab', id: 5, name: 'Team name unavailable' }],
    ])
    expect([...mapped]).toEqual([[7, 'West Bluff']])
  }
})
