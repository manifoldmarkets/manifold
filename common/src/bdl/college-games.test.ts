import { BDL_LEAGUES } from './leagues'
import {
  collegeApRanks,
  collegeGame,
  collegeGameScope,
  collegeTeam,
  matchCollegeTeams,
  type CollegeLeague,
  type CollegeScheduleWindow,
} from './college-games'

const team = (id: number, name: string, conference = 3) => ({
  id,
  full_name: name,
  conference_id: conference,
  abbreviation: 'T' + id,
})
const raw = (season = 2027) => ({
  id: 97,
  season,
  week: 3,
  date: '2027-11-21T01:20Z',
  status_state: 'scheduled',
  home_team: team(11, 'South Harbor'),
  visitor_team: team(22, 'East Ridge'),
  home_score: 0,
  away_score: 0,
})
const poll = (league: CollegeLeague = 'ncaab', season = 2027, week = 3) =>
  collegeApRanks(league, season, week, [
    {
      season,
      week,
      team: { id: 11 },
      rank: 25,
      poll: league === 'ncaaf' ? undefined : 'ap',
    },
    { season, week, team: { id: 22 }, rank: 2, poll: 'coach' },
    { season: season + 1, week, team: { id: 31 }, rank: 1, poll: 'ap' },
    { season, week: week - 1, team: { id: 35 }, rank: 1, poll: 'ap' },
    { season, week, team: { id: 41 }, rank: 26, poll: 'ap' },
  ])
const policy = (league: CollegeLeague): CollegeScheduleWindow => ({
  league,
  season: 2027,
  regularSeasonStart: '2027-09-01',
  regularSeasonEnd: '2028-02-28',
  tournamentStartByConference: new Map([['3', '2028-02-20']]),
  playoffGameIds: new Set(),
  poll: poll(league),
  pollEffectiveDates: { from: '2027-11-15', to: '2027-11-21' },
})

it('keeps IDs, confirmed time, Eastern slate date and unknown entrant distinct from scores', () => {
  const game = collegeGame('ncaab', raw())
  expect(game).toMatchObject({
    league: 'ncaab',
    gameId: 97,
    eventId: 'bdl:ncaab:97',
    startTime: '2027-11-21T01:20:00.000Z',
    slateDate: '2027-11-20',
    status: 'scheduled',
    homeScore: null,
    awayScore: null,
    home: { id: 11, conferenceId: '3' },
  })
  expect(collegeGame('ncaab', { ...raw(), date: '2027-02-30' })).toMatchObject({
    startTime: null,
    slateDate: null,
  })
  expect(
    collegeGame('ncaab', {
      ...raw(),
      date: '2027-11-21',
      status_state: 'final',
      visitor_team: { id: 33, full_name: 'TBD' },
    })
  ).toMatchObject({
    startTime: null,
    slateDate: '2027-11-21',
    homeScore: 0,
    away: null,
  })
  expect(
    collegeGame('ncaaf', {
      ...raw(),
      home_team: { id: 11, full_name: 'Sky', conference: 9 },
    }).home?.conferenceId
  ).toBe('9')
  expect(() =>
    collegeGame('ncaab', { ...raw(), visitor_team: raw().home_team })
  ).toThrow('Duplicate')
  expect(() => collegeGame('ncaab', { ...raw(), id: '10e3' })).toThrow('ID')
  expect(
    collegeGame('cbb', {
      ...raw(),
      status_state: 'final',
      home_score: 2,
      away_score: 2,
    })
  ).toMatchObject({ eventId: 'bdl:cbb:97', homeScore: 2, awayScore: 2 })
  expect(BDL_LEAGUES.cbb.sportId).toBe('cbase')
  expect(BDL_LEAGUES.ncaab.sportId).toBe('cbb')
})
it('accepts only an AP top-25 member from the intended week and league', () => {
  for (const league of ['ncaab', 'ncaaf', 'ncaaw'] as const) {
    expect([...poll(league).ranks]).toEqual([[11, 25]])
    const game = collegeGame(league, raw()),
      p = policy(league)
    expect(collegeGameScope(game, p)).toBe('ranked-regular-season')
    expect(
      collegeGameScope(game, { ...p, poll: poll(league, 2028) })
    ).toBeNull()
    expect(
      collegeGameScope(game, {
        ...p,
        poll: poll(league === 'ncaaf' ? 'ncaab' : 'ncaaf'),
      })
    ).toBeNull()
    expect(collegeGameScope({ ...game, home: null }, p)).toBeNull()
    expect(
      collegeGameScope({ ...game, home: collegeTeam(team(2, 'Harbor')) }, p)
    ).toBeNull()
    expect(collegeGameScope({ ...game, postseason: true }, p)).toBeNull()
  }
  const basketball = collegeGame('ncaab', raw()),
    p = policy('ncaab')
  for (const dates of [
    undefined,
    { from: '2027-11-22', to: '2027-11-28' },
    { from: '2027-11-08', to: '2027-11-14' },
  ])
    expect(
      collegeGameScope(basketball, { ...p, pollEffectiveDates: dates })
    ).toBeNull()
  const football = collegeGame('ncaaf', raw())
  expect(collegeGameScope({ ...football, week: 4 }, policy('ncaaf'))).toBeNull()
  expect(collegeGameScope(collegeGame('cbb', raw()), policy('cbb'))).toBeNull()
})
it('honors both conference locks, separately verified NCAA games and the Q42 football cutover', () => {
  const game = collegeGame('ncaab', raw()),
    p = policy('ncaab')
  expect(
    collegeGameScope(game, { ...p, tournamentStartByConference: new Map() })
  ).toBeNull()
  const earlier = new Map([
    ['3', '2028-02-20'],
    ['7', '2027-11-20'],
  ])
  for (const side of ['home', 'away'] as const) {
    expect(
      collegeGameScope(
        { ...game, [side]: collegeTeam(team(25, 'West', 7)) },
        { ...p, tournamentStartByConference: earlier }
      )
    ).toBeNull()
  }
  expect(
    collegeGameScope({ ...game, postseason: true }, p, new Set([game.eventId]))
  ).toBe('march-madness')
  expect(
    collegeGameScope(
      { ...game, postseason: true },
      p,
      new Set(['bdl:ncaaw:97'])
    )
  ).toBeNull()
  const football = collegeGame('ncaaf', raw()),
    f = { ...policy('ncaaf'), playoffGameIds: new Set([97]) }
  expect(collegeGameScope(football, f)).toBe('listed-football-postseason')
  expect(
    collegeGameScope({ ...football, season: 2026 }, { ...f, season: 2026 })
  ).toBeNull()
  expect(
    collegeGameScope(
      { ...football, slateDate: '2028-01-03' },
      { ...f, regularSeasonEnd: '2027-11-30', playoffGameIds: new Set() }
    )
  ).toBeNull()
})
it('returns every ambiguous or unmapped team once, and honors a verified ID mapping', () => {
  const teams = [
    team(1, 'N. Hill'),
    team(2, 'North Hill'),
    team(3, 'North Hill'),
    team(4, 'Unknown'),
    team(4, 'Unknown'),
    team(5, 'South Bay'),
  ].map((r) => collegeTeam(r)!)
  const result = matchCollegeTeams(
    teams,
    ['North Hill', 'South Bay', 'North Heights'],
    new Map([[1, 'North Heights']])
  )
  expect([...result.mapped]).toEqual([
    [1, 'North Heights'],
    [5, 'South Bay'],
  ])
  expect([...result.unmatched.keys()].sort()).toEqual([2, 3, 4])
  expect(
    matchCollegeTeams([teams[5]], ['South Bay', 'South-Bay']).unmatched.has(5)
  ).toBe(true)
  expect(
    matchCollegeTeams(
      [teams[5]],
      ['South Bay'],
      new Map([[5, 'Absent']])
    ).unmatched.has(5)
  ).toBe(true)
})

it('reserves verified names off slate and rejects every order of ambiguous fallback claims', () => {
  const names = ['A School', 'B School']
  const a = collegeTeam(team(1, names[0]))!,
    b = { ...a, name: names[1] },
    other = { ...a, id: 2 }
  const known = new Map([[1, names[0]]])
  for (const slate of [[other], [a, other], [other, a]]) {
    const { mapped, unmatched } = matchCollegeTeams(slate, names, known)
    expect(mapped.has(2)).toBe(false)
    expect(unmatched.get(2)).toBe(names[0])
    if (slate.length > 1) expect(mapped.get(1)).toBe(names[0])
  }
  for (const slate of [
    [a, b, other],
    [b, a, other],
    [other, b, a],
    [other, a, b],
  ]) {
    const { mapped, unmatched } = matchCollegeTeams(slate, names)
    expect([...mapped]).toEqual([])
    expect([...unmatched]).toEqual([
      [1, 'A School / B School'],
      [2, 'A School'],
    ])
  }
  expect(
    matchCollegeTeams(
      [a],
      names,
      new Map([
        [1, names[0]],
        [3, names[0]],
      ])
    ).mapped.size
  ).toBe(0)
})
it('reconciles both sides of the top-25 cutoff before filtering the AP issue', () => {
  const base = { season: 2027, week: 3, team: { id: 1 }, poll: 'ap' }
  for (const ranks of [
    [25, 26],
    [26, 25],
  ])
    expect(() =>
      collegeApRanks(
        'ncaab',
        2027,
        3,
        ranks.map((rank) => ({ ...base, rank }))
      )
    ).toThrow('Conflicting')
  expect([
    ...collegeApRanks('ncaab', 2027, 3, [
      { ...base, rank: 25 },
      { ...base, rank: 26, poll: 'coach' },
    ]).ranks,
  ]).toEqual([[1, 25]])
})
