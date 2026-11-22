import {
  readEsportsSeries,
  readEsportsSeriesPage,
  esportsTournamentScope,
  type EsportsLeague,
  type EsportsPage,
} from './esports-series'
import {
  readEsportsMapPage,
  readValorantPlacementPage,
} from './esports-series-details'

const a = { id: 10, name: 'First' },
  b = { id: 30, name: 'Second' },
  tournament = { id: 7, name: 'Summer Cup', tier: 'S' }
const raw = {
  id: 42,
  tournament,
  team1: a,
  team2: b,
  team1_score: 1,
  team2_score: 2,
  winner: b,
  status: 'finished',
  status_state: 'final',
  best_of: 3,
  bo_type: 3,
  start_date: '2026-11-22T15:00:00Z',
  start_time: '2026-11-22T16:00:00Z',
  start_at: '2026-11-22T17:00:00Z',
}
function game(
  league: EsportsLeague = 'cs',
  changes: Record<string, unknown> = {}
) {
  const g = readEsportsSeries(league, { ...raw, ...changes })
  if (!g) throw Error('test fixture')
  return g
}
const page = (
  path: string,
  rows: unknown[],
  params: Record<string, unknown> = {},
  meta: unknown = {}
): EsportsPage => ({
  request: { path, params },
  status: 200,
  body: { data: rows, meta },
})
test.each(['cs', 'dota', 'lol'] as const)(
  '%s stable series key, separate native time and winner attached to team ID',
  (league) => {
    const g = game(league)
    expect(g).toMatchObject({
      eventId: 'bdl:' + league + ':42',
      team1: a,
      team2: b,
      winnerId: b.id,
      review: null,
      score: { team1: 1, team2: 2 },
      startTimeMs: Date.parse(
        league === 'cs' ? raw.start_time : raw.start_date
      ),
    })
    expect(
      game(league, { team1: b, team2: a, team1_score: 2, team2_score: 1 })
    ).toMatchObject({
      eventId: g.eventId,
      winnerId: b.id,
      score: { team1: 2, team2: 1 },
    })
  }
)
test('Valorant preserves stage, instant and declared winner without inferring Bo3 from map scores', () => {
  const g = game('valorant', {
    stage: { id: 1, name: 'Playoffs' },
    round: 'Semifinal',
  })
  expect(g).toMatchObject({
    eventId: 'bdl:valorant:42',
    startTimeMs: Date.parse(raw.start_at),
    bestOf: null,
    review: 'format',
    reportedWinnerId: b.id,
    winnerId: null,
    stage: { id: 1, name: 'Playoffs' },
    round: null,
  })
})
test('CS2 stage/round are scoped; dates, rounds and standings do not construct slots', () => {
  const stage = { id: 9, name: 'Swiss', best_of: 3 }
  expect(game('cs', { stage, round: 'Round 1', best_of: null })).toMatchObject({
    stage: { id: 9, name: 'Swiss' },
    round: 'Round 1',
    bestOf: 3,
  })
  for (const league of ['lol', 'dota'] as const)
    expect(game(league, { stage, round: 'Final' })).toMatchObject({
      stage: null,
      round: null,
    })
  expect(
    game('cs', { stage: { name: 'Playoffs' }, round: 'Final', best_of: null })
  ).toMatchObject({ stage: null, round: null, review: 'format' })
  expect(game('cs', { tournament: null })).toMatchObject({
    eventId: 'bdl:cs:42',
    tournament: null,
    review: 'tournament',
  })
})
test.each([
  [1, 1, null],
  [2, 0, a],
  [0, 2, b],
])(
  'all observed Bo2 outcomes remain outside two-sided support',
  (x, y, winner) => {
    expect(
      game('dota', { bo_type: 2, team1_score: x, team2_score: y, winner })
    ).toMatchObject({
      skipBestOfTwo: true,
      winnerId: null,
      score: { team1: x, team2: y },
    })
  }
)
test.each([
  [{ team2: null }, 'entrants'],
  [{ team2: a }, 'entrants'],
  [{ team2: { id: 32, name: '  FIRST ' } }, 'entrants'],
  [{ winner: { id: b.id, name: a.name } }, 'winner'],
  [{ status: 'upcoming' }, 'status'],
  [
    {
      status_state: 'scheduled',
      winner: null,
      team1_score: 1,
      team2_score: null,
    },
    'status',
  ],
  [{ team1: { id: 44, name: 'TBD' } }, 'entrants'],
  [{ team1: { id: 44, name: 'Winner of earlier series' } }, 'entrants'],
  [{ status: 'walkover' }, 'forfeit'],
  [{ is_forfeit: true }, 'forfeit'],
  [{ status: 'lost_by_forfeit' }, 'forfeit'],
  [{ status_state: 'unknown' }, 'status'],
  [{ status: 'finished', status_state: null }, 'status'],
  [{ team1_score: 0, team2_score: 1 }, 'score'],
  [{ team1_score: 0, team2_score: 3 }, 'score'],
  [{ team1_score: 2, team2_score: 2 }, 'score'],
  [{ team1_score: 1.5 }, 'score'],
  [{ team2_score: null }, 'score'],
  [{ winner: a }, 'winner'],
  [{ winner: null }, 'winner'],
  [{ winner: { id: 77, name: 'Other' } }, 'winner'],
  [{ loser: b }, 'winner'],
  [{ best_of: 7 }, 'format'],
  [{ status_state: 'scheduled' }, 'status'],
  [{ status_state: 'in_progress' }, 'status'],
] as const)('holds contradictory or unknown evidence %#', (changes, review) => {
  expect(game('cs', changes)).toMatchObject({ review, winnerId: null })
})
test.each(['cs', 'dota', 'valorant', 'lol'] as const)(
  '%s default wins retain the reported result for review',
  (league) => {
    const first = { id: 771, name: 'First' },
      second = { id: 769, name: 'Second' }
    const received = {
      ...raw,
      id: 64290,
      tournament: { id: 2142, name: 'Tournament', tier: 's' },
      best_of: 1,
      bo_type: 1,
      team1: first,
      team2: second,
      team1_score: 1,
      team2_score: 0,
      winner: first,
      loser: second,
      status: 'defwin',
      status_state: 'final',
    }
    const result = readEsportsSeriesPage(
      league,
      page('/' + league + '/v1/matches', [received], { tournament_id: 2142 })
    )
    expect(result?.series[0]).toMatchObject({
      score: { team1: 1, team2: 0 },
      review: 'forfeit',
      reportedWinnerId: 771,
      winnerId: null,
    })
    expect(
      readEsportsSeries(league, { ...received, status: ' DEFWIN ' })?.review
    ).toBe('forfeit')
    if (league !== 'valorant')
      expect(
        readEsportsSeries(league, { ...received, status: 'finished' })
      ).toMatchObject({ review: null, winnerId: 771 })
  }
)

test.each([1, 3, 5])('Bo%s only verifies a physically clinched score', (bo) => {
  const needed = (bo + 1) / 2
  expect(
    game('lol', { bo_type: bo, team1_score: 0, team2_score: needed })
  ).toMatchObject({ review: null, winnerId: b.id })
  expect(
    game('lol', { bo_type: bo, team1_score: 0, team2_score: needed - 1 })
  ).toMatchObject({ review: 'score', winnerId: null })
})
test('unplayed and in-progress observations never produce a winner', () => {
  const scheduled = {
    status_state: 'scheduled',
    winner: null,
    team1_score: null,
    team2_score: null,
  }
  expect(game('cs', scheduled)).toMatchObject({
    review: null,
    score: null,
    winnerId: null,
  })
  expect(
    game('cs', { ...scheduled, start_time: '2026-02-30T16:00:00Z' }).review
  ).toBe('start')
  expect(
    game('cs', {
      ...scheduled,
      status_state: 'in_progress',
      team1_score: 0,
      team2_score: 1,
    })
  ).toMatchObject({
    review: null,
    score: { team1: 0, team2: 1 },
    winnerId: null,
  })
})
test('Q16 scope requires selected S tier or a verified ID in the right game', () => {
  expect(esportsTournamentScope(game())).toBe('in-scope')
  expect(
    esportsTournamentScope(
      game('dota', { tournament: { ...tournament, tier: 'a' } })
    )
  ).toBe('out-of-scope')
  expect(
    esportsTournamentScope(
      game('cs', { tournament: { ...tournament, tier: null } })
    )
  ).toBe('unverified')
  const g = game('valorant', {
    tournament: { ...tournament, name: 'VCT Americas Qualifier' },
  })
  expect(esportsTournamentScope(g, { lol: new Set([7]) })).toBe('unverified')
  expect(esportsTournamentScope(g, { valorant: new Set([7]) })).toBe('in-scope')
})
test('ignoring tournament filters or returning two versions never verifies membership', () => {
  const rsp = page(
    '/dota/v1/matches',
    [
      raw,
      { ...raw, id: 43, tournament: { id: 8, name: 'Other' } },
      null,
      { ...raw, id: 44 },
      { ...raw, id: 44, team1: b },
    ],
    { tournament_id: '7' },
    { next_cursor: 35 }
  )
  const x = readEsportsSeriesPage('dota', rsp)
  expect(x?.series.map((s) => s.id)).toEqual([42])
  expect(x).toMatchObject({
    conflictingIds: [44],
    malformed: 1,
    outsideTournament: 1,
    nextCursor: '35',
  })
  expect(readEsportsSeriesPage('lol', rsp)).toBeNull()
  expect(readEsportsSeriesPage('dota', { ...rsp, status: 401 })).toBeNull()
  expect(
    readEsportsSeriesPage(
      'dota',
      page('/dota/v1/matches', [], { tournament_id: 'NaN' })
    )
  ).toBeNull()
  expect(
    readEsportsSeriesPage('dota', page('/dota/v1/matches', []))?.series
  ).toEqual([])
})
test('confirms positive UTC-day membership when an upstream date filter is ignored', () => {
  const ignored = page(
    '/dota/v1/matches',
    [
      raw,
      { ...raw, id: 43, start_date: '2026-11-23T01:00:00Z' },
      { ...raw, id: 44, start_date: null },
    ],
    { 'dates[]': ['2026-11-22'] }
  )
  const actual = readEsportsSeriesPage('dota', ignored)
  expect(actual?.series.map((s) => s.id)).toEqual([42])
  expect(actual?.outsideDates).toBe(2)
  expect(
    readEsportsSeriesPage(
      'dota',
      page('/dota/v1/matches', [raw], { 'dates[]': ['2026-02-30'] })
    )
  ).toBeNull()
})
const map = {
  id: 33,
  match_id: 42,
  game_number: 1,
  map_number: 1,
  map: { id: 7, name: 'Sunset' },
  map_name: 'de_nuke',
  team1_score: 10,
  team2_score: 13,
  winner: b,
  loser: a,
  winner_score: 13,
  loser_score: 10,
  status_state: 'final',
}
test.each(['cs', 'valorant', 'lol', 'dota'] as const)(
  '%s maps unambiguously retain player sides and game number',
  (league) => {
    const req = page(
      '/' + league + '/v1/match_maps',
      [map],
      league === 'cs' ? { 'match_ids[]': [42] } : { match_id: 42 }
    )
    const result = readEsportsMapPage(game(league), req)
    expect(result?.maps[0]).toMatchObject({
      number: 1,
      winnerId: b.id,
      roundScores:
        league === 'cs' || league === 'valorant'
          ? { team1: 10, team2: 13 }
          : null,
      name:
        league === 'cs' ? 'de_nuke' : league === 'valorant' ? 'Sunset' : null,
    })
    expect(result?.nextCursor).toBeNull()
  }
)
test('maps from different matches, conflicting winners, duplicate map slots and incomplete snapshots stay separate', () => {
  const g = game('valorant'),
    req = (rows: unknown[]) =>
      page('/valorant/v1/match_maps', rows, { match_id: '42' })
  for (const x of [
    { ...map, match_id: 99 },
    { ...map, winner: a },
    { ...map, winner_score: 9 },
    { ...map, loser: { id: 37, name: 'Outside' } },
  ])
    expect(readEsportsMapPage(g, req([x]))).toBeNull()
  expect(readEsportsMapPage(g, req([map, { ...map, id: 35 }]))).toBeNull()
  expect(
    readEsportsMapPage(
      g,
      req([{ ...map, status_state: 'in_progress', winner: null, loser: null }])
    )?.maps[0]
  ).toMatchObject({ winnerId: null, roundScores: null })
  expect(
    readEsportsMapPage(g, {
      ...req([map]),
      request: { path: '/valorant/v1/match_maps', params: { match_id: 43 } },
    })
  ).toBeNull()
})
const prize = (id: number, placement: string) => ({
  id,
  tournament_id: 7,
  team: { id: id + 100, name: 'Name ' + id },
  placement,
})
test('Valorant prizes preserve rank ranges, both tied teams and unavailable data without constructing advancement', () => {
  const req = (rows: unknown[]) =>
    page('/valorant/v1/tournament_prizes', rows, { tournament_id: 7 })
  const x = readValorantPlacementPage(
    7,
    req([prize(3, '5-6th'), prize(2, '5-6th'), prize(1, '1st')])
  )
  expect(x?.placements.map((p) => [p.team.id, p.first, p.last])).toEqual([
    [101, 1, 1],
    [102, 5, 6],
    [103, 5, 6],
  ])
  for (const raw of [
    prize(1, '3-2nd'),
    prize(1, '2st'),
    prize(1, 'unplaced'),
    { ...prize(1, '1st'), tournament_id: 8 },
  ])
    expect(readValorantPlacementPage(7, req([raw]))).toBeNull()
  expect(
    readValorantPlacementPage(7, req([prize(1, '1st'), prize(1, '2nd')]))
  ).toBeNull()
  expect(readValorantPlacementPage(8, req([prize(1, '1st')]))).toBeNull()
})
