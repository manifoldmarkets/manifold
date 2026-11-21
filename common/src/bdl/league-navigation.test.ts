import { BDL_LEAGUES, BDL_LEAGUE_KEYS } from './leagues'
import { MANIFOLD_SPORTS_USER_IDS, WORLD_CUP_2026 } from '../sports'
import {
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
  expect(leagueChoices('soccer', leagues).slice(0, 2)).toEqual([
    'laliga',
    'epl',
  ])
  expect(
    byEngagement(['nfl', 'wnba', 'nba', 'soccer'], (key) => key, sports)
  ).toEqual(['soccer', 'nba', 'nfl', 'wnba'])
})

it('shows exactly the registry for All and just its own leagues on each sport, with stable presets for new and anonymous viewers', () => {
  const empty = sportsEngagement([])
  expect(leagueChoices('all', empty.leagues)).toEqual(BDL_LEAGUE_KEYS)
  expect(leagueChoices('soccer', empty.leagues)).toEqual(
    BDL_LEAGUE_KEYS.filter((key) => BDL_LEAGUES[key].sportKey === 'soccer')
  )
  expect(leagueChoices('unrelated', empty.leagues)).toEqual([])
  expect(leagueChoices('soccer', empty.leagues)).toContain('fifa/worldcup')
  expect(byEngagement(['nba', 'soccer'], (key) => key, empty.sports)).toEqual([
    'nba',
    'soccer',
  ])
})
