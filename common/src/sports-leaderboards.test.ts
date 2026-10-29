import {
  leaderboardBoardsForMarket,
  leaderboardSportForMarket,
  topicBoardKey,
} from './sports-leaderboards'
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

  const boardsOf = (groupIds: string[]) =>
    leaderboardBoardsForMarket({ groupIds }, index)

  it("counts a market toward its topic's board as well", () => {
    expect(boardsOf(['tdf'])).toEqual([
      'all',
      'road-bicycle-racing',
      topicBoardKey('tdf'),
    ])
    // A sport's main topic has the sport's board, not a topic board.
    expect(boardsOf(['cycling'])).toEqual(['all', 'road-bicycle-racing'])
    expect(boardsOf([sportsBetting, 'tdf'])).toEqual([
      'all',
      'road-bicycle-racing',
      topicBoardKey(sportsBetting),
      topicBoardKey('tdf'),
    ])
    expect(boardsOf([])).toEqual(['all'])
  })

  it('counts a market toward the board of each topic above its own', () => {
    const nested = buildSportsIndex(
      [
        {
          id: 'cycling',
          slug: 'road-bicycle-racing',
          name: 'Cycling',
          totalMembers: 9,
        },
        {
          id: 'tours',
          slug: 'grand-tours',
          name: 'Grand tours',
          totalMembers: 3,
        },
        {
          id: 'tdf',
          slug: 'tour-de-france',
          name: 'Tour de France',
          totalMembers: 2,
        },
      ],
      [
        { parentId: SPORTS_DEFAULT_GROUP_ID, childId: 'cycling' },
        { parentId: 'cycling', childId: 'tours' },
        { parentId: 'tours', childId: 'tdf' },
      ]
    )
    expect(leaderboardBoardsForMarket({ groupIds: ['tdf'] }, nested)).toEqual([
      'all',
      'road-bicycle-racing',
      topicBoardKey('tours'),
      topicBoardKey('tdf'),
    ])
  })
})
