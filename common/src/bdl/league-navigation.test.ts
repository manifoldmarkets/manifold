import { BDL_LEAGUE_KEYS, BdlLeagueKey } from './leagues'
import { MANIFOLD_SPORTS_USER_IDS, WORLD_CUP_2026 } from '../sports'
import {
  availableGameLeagues,
  marketLeagueKey,
  sportsNavigationPath,
  sportRailSections,
  leagueForSport,
  byEngagement,
  gameLeagueKey,
  leagueChoices,
  sportsEngagement,
} from './league-navigation'

jest.mock('./rollout', () => ({ isSportsBdlEnabled: () => true }))

const house = MANIFOLD_SPORTS_USER_IDS[0]
const game = (sportsEventId: string, league: string) => ({
  sportsEventId,
  league,
})

it('matches the canonical key, a legacy Odds game, and the older World Cup label without guessing the entire soccer family', () => {
  expect(
    gameLeagueKey({
      ...game('bdl:laliga:24', 'Soccer'),
      sportsLeagueKey: 'laliga',
    })
  ).toBe('laliga')
  expect(gameLeagueKey(game('odds:soccer_epl:abc', 'Soccer'))).toBe('epl')
  expect(gameLeagueKey(game('old', 'LA LIGA'))).toBe('laliga')
  expect(gameLeagueKey(game('old', WORLD_CUP_2026.sportsLeague))).toBe(
    'fifa/worldcup'
  )
  expect(gameLeagueKey(game('unrecognized', 'Soccer'))).toBeUndefined()
})

it('orders canonical leagues by distinct engaged markets and keeps preset ties stable', () => {
  const recent = [
    {
      id: 'aa',
      creatorId: house,
      sportsEventId: 'bdl:laliga:1',
      sportsLeague: 'Soccer',
    },
    {
      id: 'aa',
      creatorId: house,
      sportsEventId: 'bdl:laliga:1',
      sportsLeague: 'Soccer',
    },
    {
      id: 'bb',
      creatorId: house,
      sportsEventId: 'odds:soccer_spain_la_liga:b',
      sportsLeague: 'Soccer',
    },
    {
      id: 'cc',
      creatorId: house,
      sportsEventId: 'odds:soccer_epl:c',
      sportsLeague: 'Soccer',
    },
    {
      id: 'dd',
      creatorId: house,
      sportsEventId: 'bdl:nba:4',
      sportsLeague: 'NBA',
    },
    {
      id: 'ee',
      creatorId: 'other-user',
      sportsEventId: 'bdl:epl:5',
      sportsLeagueKey: 'epl' as const,
    },
    {
      id: 'ff',
      creatorId: house,
      sportsEventId: 'bdl:epl:6',
      sportsFixture: true as const,
    },
    { id: 'gg', creatorId: 'other-user' },
  ]
  const { leagues, sports } = sportsEngagement(recent)
  expect(Object.fromEntries(leagues)).toEqual({ laliga: 2, epl: 1, nba: 1 })
  expect(Object.fromEntries(sports)).toEqual({ soccer: 3, nba: 1 })
  expect(
    leagueChoices('soccer', leagues, ['epl', 'laliga']).slice(0, 2)
  ).toEqual(['laliga', 'epl'])
  expect(
    byEngagement(['nfl', 'wnba', 'nba', 'soccer'], (key) => key, sports)
  ).toEqual(['soccer', 'nba', 'nfl', 'wnba'])
})

it('advertises only available leagues and keeps preset order for viewers with no history', () => {
  const available: BdlLeagueKey[] = ['laliga', 'nba', 'epl', 'ncaaw']
  const empty = sportsEngagement([])
  expect(leagueChoices('all', empty.leagues, available)).toEqual(
    BDL_LEAGUE_KEYS.filter((k) => available.includes(k))
  )
  expect(leagueChoices('soccer', empty.leagues, available)).toEqual([
    'epl',
    'laliga',
  ])
  expect(leagueChoices('unrelated', empty.leagues, available)).toEqual([])
  expect(leagueChoices('all', empty.leagues, [])).toEqual([])
  expect(leagueForSport('fifa/worldcup', 'soccer')).toBe('fifa/worldcup')
  expect(leagueForSport('epl', 'nfl')).toBeUndefined()
  expect(leagueForSport(['epl', 'laliga'], 'soccer')).toBeUndefined()
})

it.each([
  ['bdl:laliga:24', 'Soccer', 'laliga'],
  ['old-laliga', 'LA LIGA', 'laliga'],
  ['odds:basketball_wncaab:abc', 'WNCAAB', 'ncaaw'],
  ['old-college', 'WNCAAB', 'ncaaw'],
  ['odds:icehockey_nhl_preseason:h', 'NHL Preseason', 'nhl'],
  ['bdl-f1:1:2', 'Formula 1', 'f1'],
  ['bdl-f1:1e1:2', 'Formula 1', undefined],
  ['bdl-f1:01:2', 'Formula 1', undefined],
  ['bdl-f1-title:2026:drivers', 'Formula 1', 'f1'],
  ['odds:constructor:foo', 'EPL', undefined],
  ['odds:__proto__:foo', 'EPL', undefined],
  ['odds:toString:foo', 'EPL', undefined],
  ['odds:unknown:foo', 'EPL', undefined],
  ['bdl:laliga:oops', 'EPL', undefined],
  ['bdl:laliga:24', 'EPL', undefined],
] as const)(
  'uses the same %s identity for an official game and engagement',
  (id, label, expected) => {
    expect(gameLeagueKey(game(id, label))).toBe(expected)
    const counts = sportsEngagement([
      { id: 'row', creatorId: house, sportsEventId: id, sportsLeague: label },
    ])
    expect([...counts.leagues]).toEqual(expected ? [[expected, 1]] : [])
  }
)
it('rejects contradictory provider and league evidence including a projected disagreement', () => {
  expect(
    marketLeagueKey({ sportsEventId: 'bdl:nhl:22', sportsLeagueKey: 'nba' })
  ).toBeUndefined()
  expect(
    marketLeagueKey({
      sportsEventId: 'odds:soccer_epl:abc',
      sportsProvider: 'football-data',
      sportsLeague: 'EPL',
    })
  ).toBeUndefined()
  expect(
    availableGameLeagues(
      [{ ...game('odds:soccer_epl:abc', 'Soccer'), navigationLeagueKey: null }],
      false
    )
  ).toEqual([])
  expect(
    availableGameLeagues(
      [
        { ...game('bdl:laliga:24', 'Soccer'), navigationLeagueKey: 'laliga' },
        {
          ...game('odds:soccer_epl:abc', 'Soccer'),
          navigationLeagueKey: 'epl',
        },
      ],
      true
    )
  ).toEqual(['epl', 'laliga', 'f1'])
})

it('keeps a valid league and destination tab through sport and topic redirects', () => {
  expect(
    sportsNavigationPath('/sports/soccer', 'soccer', 'fifa/worldcup', 'markets')
  ).toBe('/sports/soccer?league=fifa%2Fworldcup&tab=markets')
  expect(sportsNavigationPath('/sports', 'all', 'epl', 'upcoming')).toBe(
    '/sports?league=epl&tab=upcoming'
  )
  expect(sportsNavigationPath('/sports/f1', 'f1', 'epl', 'upcoming')).toBe(
    '/sports/f1'
  )
  expect(
    gameLeagueKey({ ...game('bdl:nhl:22', 'NHL'), navigationLeagueKey: 'nba' })
  ).toBeUndefined()
})

it('preserves games-first ordering and the divider for anonymous, empty and tied histories', () => {
  const sports = ['nhl', 'epl', 'nba', 'other'].map((key) => ({ key }))
  const counts = { epl: 1, nba: 3 }
  const sections = (history?: ReadonlyMap<string, number>) =>
    sportRailSections(sports, counts, history).map((group) =>
      group.map((s) => s.key)
    )
  expect(sections()).toEqual([['epl', 'nba'], ['nhl']])
  expect(sections(new Map())).toEqual(sections())
  expect(
    sections(
      new Map([
        ['nhl', 1],
        ['epl', 1],
        ['nba', 1],
      ])
    )
  ).toEqual(sections())
  expect(sections(new Map([['nhl', 3]]))).toEqual([['nhl', 'epl', 'nba'], []])
})

it('requires separately verified racing eligibility even if an old team row looks like F1', () => {
  expect(availableGameLeagues([game('bdl-f1:1:2', 'F1')], false)).toEqual([])
})

it('keeps old projections without their original provider stamps out of public league choices', () => {
  const old = game('odds:soccer_italy_serie_a:abc', 'Soccer')
  expect(availableGameLeagues([old], false)).toEqual([])
  expect(
    availableGameLeagues([{ ...old, navigationLeagueKey: 'seriea' }], false)
  ).toEqual(['seriea'])
  expect(
    availableGameLeagues([{ ...old, navigationLeagueKey: null }], false)
  ).toEqual([])
})
