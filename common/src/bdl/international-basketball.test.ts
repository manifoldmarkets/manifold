import { BDL_LEAGUES, BDL_LEAGUE_KEYS } from './leagues'
import { BDL_STUCK_GAME_MS } from './constants'
import {
  INTERNATIONAL_BASKETBALL_LEAGUES,
  internationalBasketballAttention,
  internationalBasketballFinalChanged,
  readInternationalBasketballGame,
  readInternationalBasketballGamesPage,
  readInternationalBasketballScoringPage,
  readInternationalBasketballScoring,
} from './international-basketball'

const row = {
  id: 17,
  season: 2026,
  status: 'live',
  datetime: '2026-11-22T16:00:00Z',
  home_team: { id: 2, name: 'Home', abbreviation: 'H' },
  visitor_team: { id: 8, name: 'Visitor', abbreviation: null },
  home_team_score: 0,
  visitor_team_score: 3,
}
const read = (changes: Partial<Record<keyof typeof row, unknown>> = {}) => {
  const game = readInternationalBasketballGame('acb', { ...row, ...changes })
  if (!game) throw Error('Unusable fixture')
  return game
}
const update = (
  sequence: number,
  period: number,
  home: number,
  away: number
) => ({
  id: 100 + sequence,
  sequence,
  period,
  home_team_score: home,
  visitor_team_score: away,
  game_id: row.id,
})
const scoring = (rows: unknown[]) =>
  readInternationalBasketballScoring(read(), {
    league: 'acb',
    gameId: row.id,
    rows,
  })
const start = Date.parse(row.datetime)

test('all registry international namespaces are supported and default off', () => {
  expect([...INTERNATIONAL_BASKETBALL_LEAGUES].sort()).toEqual(
    BDL_LEAGUE_KEYS.filter((key) =>
      ['cba', 'european-basketball'].includes(BDL_LEAGUES[key].adapter)
    ).sort()
  )
  for (const league of INTERNATIONAL_BASKETBALL_LEAGUES) {
    expect(BDL_LEAGUES[league].defaultAutoCreate).toBe(false)
    expect(BDL_LEAGUES[league].oddsApiBase).toBeNull()
    expect(readInternationalBasketballGame(league, row)?.eventId).toBe(
      'bdl:' + league + ':17'
    )
  }
})
test.each([
  ['scheduled', 'scheduled'],
  ['live', 'in_progress'],
  ['final', 'final'],
  ['postponed', 'postponed'],
  ['cancelled', 'canceled'],
  ['suspended', 'unknown'],
  ['finished', 'unknown'],
])('uses the European lifecycle field %s', (status, expected) => {
  expect(read({ status }).status).toBe(expected)
})
test('preserves home and visitor identity, UTC instant and a genuine zero', () => {
  expect(read()).toMatchObject({
    league: 'acb',
    id: 17,
    startTimeMs: start,
    home: { id: 2, abbreviation: 'H' },
    away: { id: 8, abbreviation: null },
    score: { home: 0, away: 3 },
    currentPeriod: null,
  })
  expect(read({ datetime: '2026-11-22T18:00:00+02:00' }).startTimeMs).toBe(
    start
  )
  expect(read({ datetime: '2026-02-30T10:00:00Z' }).startTimeMs).toBeNull()
  expect(read({ datetime: '2026-11-22' }).startTimeMs).toBeNull()
})
test.each([
  null,
  {},
  { ...row, id: 0 },
  { ...row, home_team: null },
  { ...row, visitor_team: row.home_team },
  { ...row, home_team: { id: 5, name: '  ' } },
])('invalid identities are never market-grade', (raw) => {
  expect(readInternationalBasketballGame('bcl', raw)).toBeNull()
})
test.each([null, NaN, -1, 1.5, '0', Number.MAX_SAFE_INTEGER + 1])(
  'keeps missing or invalid scores unavailable',
  (n) => {
    expect(read({ visitor_team_score: n }).score).toBeNull()
  }
)
test('isolates the CBA status, period, supplied names and season type', () => {
  const cba = {
    ...row,
    status: 'final',
    current_period: 5,
    season_type: 'playoffs',
    home_team: { id: 3, name: '上海久事', abbreviation: 'UNVERIFIED' },
  }
  expect(readInternationalBasketballGame('cba', cba)).toMatchObject({
    eventId: 'bdl:cba:17',
    currentPeriod: 5,
    seasonType: 'playoffs',
    status: 'final',
    home: { id: 3, name: '上海久事', abbreviation: null },
  })
  expect(
    readInternationalBasketballGame('cba', { ...cba, status: 'live' })
  ).toMatchObject({ status: 'unknown', rawStatus: 'live' })
  expect(
    readInternationalBasketballGame('cba', {
      ...cba,
      status: 'scheduled',
      current_period: null,
    })?.status
  ).toBe('scheduled')
  expect(readInternationalBasketballGame('israel', cba)).toMatchObject({
    currentPeriod: null,
    seasonType: null,
  })
})
test('only flags a stuck game at the four-hour boundary and never promotes a result by elapsed time', () => {
  const live = read()
  expect(
    internationalBasketballAttention(live, start + BDL_STUCK_GAME_MS - 1)
  ).toBeNull()
  expect(
    internationalBasketballAttention(live, start + BDL_STUCK_GAME_MS)
  ).toBe('overdue')
  expect(
    internationalBasketballAttention(
      read({ status: 'postponed' }),
      start + BDL_STUCK_GAME_MS
    )
  ).toBeNull()
  expect(
    internationalBasketballAttention(read({ status: 'scheduled' }), start - 1)
  ).toBe('scheduled-with-play')
  expect(
    internationalBasketballAttention(
      read({ status: 'final', home_team_score: 3 }),
      start
    )
  ).toBe('unverified-final')
  expect(
    internationalBasketballAttention(
      read({ status: 'final', home_team_score: null }),
      start
    )
  ).toBe('unverified-final')
  expect(
    internationalBasketballAttention(read({ status: 'delayed' }), start)
  ).toBe('unknown-status')
})
test('a later final score correction references the same event and both same-position team IDs', () => {
  const game = read({ status: 'final' })
  const before = { game, observedAtMs: start }
  const corrected = read({ status: 'final', visitor_team_score: 2 })
  const after = { game: corrected, observedAtMs: start + 1 }
  expect(internationalBasketballFinalChanged(before, after)).toBe(true)
  for (const candidate of [
    { ...after, observedAtMs: start },
    { ...after, observedAtMs: NaN },
    { ...after, game },
    { ...after, game: read() },
    { ...after, game: { ...corrected, home: game.away } },
    { ...after, game: { ...corrected, eventId: 'bdl:aba:17' } },
    { ...after, game: { ...corrected, score: null } },
  ]) {
    expect(internationalBasketballFinalChanged(before, candidate)).toBe(false)
  }
})
test('a cumulative sequence preserves source IDs, orders the updates, and derives only observed period points', () => {
  const a = update(1, 1, 0, 3),
    b = update(2, 1, 2, 3),
    c = update(3, 2, 2, 5)
  const result = scoring([c, b, a])
  expect(result).toMatchObject({
    lastScoringPeriod: 2,
    periodScores: [
      { period: 1, score: { home: 2, away: 3 } },
      { period: 2, score: { home: 0, away: 2 } },
    ],
    scoreDecreased: false,
  })
  expect(result?.updates.map((x) => x.id)).toEqual([101, 102, 103])
  expect(result).not.toHaveProperty('clock')
})
test('partial sequences and downward corrections keep the exact observations and withhold unsupported period totals', () => {
  expect(scoring([update(4, 3, 40, 30)])).toMatchObject({
    lastScoringPeriod: 3,
    periodScores: null,
  })
  expect(
    scoring([update(1, 1, 2, 0), update(3, 2, 5, 7)])?.periodScores
  ).toBeNull()
  expect(
    scoring([update(1, 1, 2, 0), update(2, 3, 2, 3)])?.periodScores
  ).toBeNull()
  expect(scoring([update(1, 1, 4, 2), update(2, 1, 2, 2)])).toMatchObject({
    scoreDecreased: true,
    periodScores: null,
    updates: [{ score: { home: 4, away: 2 } }, { score: { home: 2, away: 2 } }],
  })
  expect(
    scoring([1, 2, 3, 4, 5].map((n) => update(n, n, n, 0)))?.lastScoringPeriod
  ).toBe(5)
})
test('conflicting identities, regression of period, duplicate sequence, and foreign or unknown requests are rejected', () => {
  const first = update(1, 1, 2, 0)
  for (const rows of [
    [],
    [null],
    [{ ...first, game_id: 99 }],
    [{ ...first, visitor_team_score: '0' }],
    [first, first],
    [first, { ...first, id: 99 }],
    [first, { ...first, sequence: 2 }],
    [update(1, 2, 2, 0), update(2, 1, 2, 0)],
  ]) {
    expect(scoring(rows)).toBeNull()
  }
  expect(
    readInternationalBasketballScoring(read(), {
      league: 'lnb',
      gameId: row.id,
      rows: [first],
    })
  ).toBeNull()
  expect(
    readInternationalBasketballScoring(read(), {
      league: 'acb',
      gameId: 99,
      rows: [first],
    })
  ).toBeNull()
  expect(
    readInternationalBasketballScoring(
      { league: 'cba', id: row.id },
      { league: 'cba', gameId: row.id, rows: [first] }
    )
  ).toBeNull()
})
test('records provider slate date using Shanghai for CBA, UTC for the European selector', () => {
  const raw = { ...row, datetime: '2026-11-22T18:00:00.000Z' }
  expect(readInternationalBasketballGame('acb', raw)?.providerDate).toBe(
    '2026-11-22'
  )
  expect(readInternationalBasketballGame('cba', raw)?.providerDate).toBe(
    '2026-11-23'
  )
})
const response = (path: string, rows: unknown[], meta: unknown = {}) => ({
  request: { path, params: { game_id: row.id } },
  status: 200,
  body: { data: rows, meta },
})
test('binds pages to their namespace, preserves pagination and withholds same-ID contradictions', () => {
  const record = response(
    '/acb/v1/games',
    [
      row,
      row,
      { ...row, id: 18 },
      { ...row, id: 18, visitor_team: row.home_team },
      { ...row, id: 19 },
      { ...row, id: 19, status: 'final' },
      {},
    ],
    { next_cursor: 12 }
  )
  const page = readInternationalBasketballGamesPage('acb', record)
  expect(page?.games.map((g) => g.id)).toEqual([17])
  expect(page).toMatchObject({
    unavailableIds: [18, 19],
    unidentifiedRows: 1,
    nextCursor: '12',
  })
  expect(readInternationalBasketballGamesPage('bbl', record)).toBeNull()
  expect(
    readInternationalBasketballGamesPage('acb', { ...record, status: 401 })
  ).toBeNull()
  expect(
    readInternationalBasketballGamesPage('acb', {
      ...record,
      body: { data: {} },
    })
  ).toBeNull()
  expect(
    readInternationalBasketballGamesPage(
      'acb',
      response('/acb/v1/games', [], { next_cursor: {} })
    )
  ).toBeNull()
  expect(
    readInternationalBasketballGamesPage('acb', response('/acb/v1/games', []))
  ).toEqual({
    games: [],
    unavailableIds: [],
    unidentifiedRows: 0,
    nextCursor: null,
  })
})
test('the scoring response must name the exact source game and endpoint even if a source ID collides', () => {
  const r = response('/acb/v1/scoring', [update(1, 1, 2, 0)], {
    next_cursor: 'more',
  })
  expect(readInternationalBasketballScoringPage(read(), r)).toMatchObject({
    nextCursor: 'more',
    scoring: { lastScoringPeriod: 1 },
  })
  expect(
    readInternationalBasketballScoringPage(read(), {
      ...r,
      request: { ...r.request, params: { game_id: '29' } },
    })
  ).toBeNull()
  expect(
    readInternationalBasketballScoringPage(read(), {
      ...r,
      request: { ...r.request, path: '/cba/v1/scoring' },
    })
  ).toBeNull()
})
