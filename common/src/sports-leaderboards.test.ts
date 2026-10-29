import { leaderboardSportForMarket } from './sports-leaderboards'
import { buildSportsIndex, SPORTS_DEFAULT_GROUP_ID } from './sports-schedule'

describe('leaderboardSportForMarket', () => {
  const nfl = 'TNQwmbE5p6dnKx2e6Qlp'
  const sportsBetting = 'b3ll9Ch9rdbcrTRAbjUf'
  const index = buildSportsIndex(
    [
      {
        id: 'cycling',
        slug: 'road-bicycle-racing',
        name: '🚲  Cycling',
        totalMembers: 10,
      },
      {
        id: 'tdf',
        slug: 'tour-de-france',
        name: 'Tour de France',
        totalMembers: 2,
      },
      {
        id: sportsBetting,
        slug: 'sports-betting',
        name: 'Sports Betting',
        totalMembers: 5,
      },
    ],
    [
      { parentId: SPORTS_DEFAULT_GROUP_ID, childId: 'cycling' },
      { parentId: 'cycling', childId: 'tdf' },
      { parentId: SPORTS_DEFAULT_GROUP_ID, childId: sportsBetting },
    ]
  )
  const sportOf = (groupIds: string[], sportsLeague?: string) =>
    leaderboardSportForMarket({ groupIds, sportsLeague }, index)

  it('counts a market toward the sport it shows under', () => {
    expect(sportOf([SPORTS_DEFAULT_GROUP_ID, nfl])).toBe('nfl')
    expect(sportOf(['tdf'])).toBe('road-bicycle-racing')
    // The pipelines' league wins over the topics, as on the game cards.
    expect(sportOf([SPORTS_DEFAULT_GROUP_ID], 'NBA')).toBe('nba')
  })

  it('counts a market with no sport toward All only', () => {
    expect(sportOf([SPORTS_DEFAULT_GROUP_ID])).toBeUndefined()
    expect(sportOf([sportsBetting])).toBeUndefined()
    expect(sportOf([])).toBeUndefined()
  })
})
