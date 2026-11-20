import {
  bdlEventId,
  bdlHeadToHeadEventId,
  fixtureEventId,
  parseBdlEventId,
  parseFixtureEventId,
} from './sports-ids'

it('round-trips game and optional suffix, including a nested provider path', () => {
  expect(parseBdlEventId(bdlEventId('nba', 213))).toEqual({
    league: 'nba',
    id: 213,
  })
  expect(parseBdlEventId(bdlEventId('fifa/worldcup', 9, 'group-a'))).toEqual({
    league: 'fifa/worldcup',
    id: 9,
    suffix: 'group-a',
  })
})

it.each(['mma', 'atp', 'wta'] as const)(
  'sorts the %s entrant pair numerically and detects replacements',
  (league) => {
    const first = bdlHeadToHeadEventId(league, 21, 10, 2)
    expect(first).toBe(`bdl:${league}:21:2-10`)
    expect(bdlHeadToHeadEventId(league, 21, 2, 10)).toBe(first)
    expect(bdlHeadToHeadEventId(league, 21, 2, 11)).not.toBe(first)
    expect(parseBdlEventId(first)).toEqual({
      league,
      id: 21,
      entrantIds: [2, 10],
    })
    expect(() => bdlHeadToHeadEventId(league, 21, 2, 2)).toThrow()
  }
)

it.each([0, -5, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
  'refuses invalid provider ID %s',
  (id) => {
    expect(() => bdlEventId('nba', id)).toThrow()
    expect(() => bdlHeadToHeadEventId('mma', 1, 2, id)).toThrow()
  }
)

it.each([
  null,
  undefined,
  'bdl',
  'bdl:nba',
  'bdl:nba:1:',
  'bdl:nba:01',
  'bdl:nba:1e3',
  'bdl:nba:-2',
  'bdl:nba:1:x:y',
  'bdl:constructor:1',
  'bdl:x:1',
  'bdl:mma:3',
  'bdl:mma:3:10-2',
  'bdl:mma:3:1-1',
  'bdl:mma:3:1-3-5',
  'bdl:mma:3:01-2',
  'odds:basketball_nba:3',
  'bdl-f1:1:2',
  'bdl-f1-title:2026:drivers',
  'bdl:f1:3',
  'fixture:nba:1',
])('leaves foreign or malformed ID %j unclaimed', (id) => {
  expect(parseBdlEventId(id)).toBeNull()
})

it('keeps fixture IDs in a separate namespace and refuses ambiguous components', () => {
  const id = fixtureEventId('nba', 'synthetic-game')
  expect(id).toBe('fixture:nba:synthetic-game')
  expect(parseFixtureEventId(id)).toEqual({
    league: 'nba',
    id: 'synthetic-game',
  })
  expect(parseBdlEventId(id)).toBeNull()
  expect(parseFixtureEventId(bdlEventId('nba', 1))).toBeNull()
  expect(parseFixtureEventId('fixture:nba:')).toBeNull()
  expect(parseFixtureEventId('fixture:nba')).toBeNull()
  expect(parseFixtureEventId('fixture:unknown:1')).toBeNull()
  expect(() => fixtureEventId('mma', '1:2')).toThrow()
  expect(() => bdlEventId('nba', 1, 'x:y')).toThrow()
})
