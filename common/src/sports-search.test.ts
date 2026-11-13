import type { RaceWeekend } from './race-weekends'
import {
  buildSportsIndex,
  CURATED_SPORTS,
  NBA_TOPIC_ID,
  ScheduleGame,
  SPORTS_DEFAULT_GROUP_ID,
  SportsTopic,
} from './sports-schedule'
import {
  findSportsHub,
  sportsHubGames,
  sportsHubStatus,
  sportsQueryForms,
} from './sports-search'
import { HOUR_MS } from './util/time'

// A slice of the prod tree under 🏟️ Sports, as in sports-schedule.test.ts.
const root = SPORTS_DEFAULT_GROUP_ID
const football = 'Vcf6CYTTSXAiStbKSqQq'
const soccer = 'ypd6vR44ZzJyN9xykx6e'
const nfl = 'TNQwmbE5p6dnKx2e6Qlp'
const basketball = 'NjkFkdkvRvBHoeMDQ5NB'
const sportsBetting = 'b3ll9Ch9rdbcrTRAbjUf'
const topics: SportsTopic[] = [
  [soccer, 'soccer', '⚽ Soccer', 8951],
  [sportsBetting, 'sports-betting', 'Sports Betting', 6163],
  [basketball, 'basketball', '🏀 Basketball', 5484],
  [NBA_TOPIC_ID, 'nba', '🏀 NBA', 5000],
  [nfl, 'nfl', '🏈 NFL', 4902],
  ['superbowl', 'super-bowl', '🏈 Super Bowl', 684],
  [football, 'football', '⚽ 🏈 Football', 2818],
  ['cycling', 'road-bicycle-racing', '🚲  Cycling', 1719],
  ['tdf', 'tour-de-france', 'Tour de France', 73],
  ['esports', 'esports', 'Esports', 204],
].map(([id, slug, name, totalMembers]) => ({
  id: id as string,
  slug: slug as string,
  name: name as string,
  totalMembers: totalMembers as number,
}))
const index = buildSportsIndex(
  topics,
  [
    [root, soccer],
    [root, sportsBetting],
    [root, basketball],
    [root, nfl],
    [root, football],
    [root, 'cycling'],
    [root, 'esports'],
    [football, soccer],
    [football, nfl],
    [basketball, NBA_TOPIC_ID],
    [nfl, 'superbowl'],
    ['cycling', 'tdf'],
  ].map(([parentId, childId]) => ({ parentId, childId }))
)

describe('sportsQueryForms', () => {
  it('compares lowercase words without emoji or punctuation', () => {
    expect(sportsQueryForms('NBA')).toEqual(['nba'])
    expect(sportsQueryForms('🏎️ F1')).toEqual(['f1'])
    expect(sportsQueryForms('N.B.A.')).toEqual(['nba'])
    expect(sportsQueryForms("  women's   college-basketball ")).toEqual([
      'womens college basketball',
    ])
  })

  it('also tries the search without the words around a name', () => {
    expect(sportsQueryForms('NBA games tonight')).toEqual([
      'nba games tonight',
      'nba',
    ])
    expect(sportsQueryForms('the NFL')).toEqual(['the nfl', 'nfl'])
    expect(sportsQueryForms('live f1 races')).toEqual(['live f1 races', 'f1'])
    // A filler word alone is the search.
    expect(sportsQueryForms('games')).toEqual(['games'])
  })

  it('has nothing for an empty or long search', () => {
    expect(sportsQueryForms('')).toEqual([])
    expect(sportsQueryForms(' ?! ')).toEqual([])
    expect(sportsQueryForms('will '.repeat(20))).toEqual([])
  })
})

describe('findSportsHub', () => {
  const hub = (term: string) => findSportsHub(term, index)

  it('finds a sport by its topic, label or long label', () => {
    expect(hub('nba')).toEqual({
      kind: 'sport',
      sport: 'nba',
      path: '/sports/nba',
      label: 'NBA',
      emoji: '🏀',
    })
    expect(hub('NFL games')).toMatchObject({ kind: 'sport', sport: 'nfl' })
    expect(hub('F1')).toMatchObject({ sport: 'f1', path: '/sports/f1' })
    expect(hub('formula 1')).toMatchObject({ sport: 'f1' })
    expect(hub('College Football')).toMatchObject({ sport: 'ncaaf' })
    expect(hub('NCAAF')).toMatchObject({ sport: 'ncaaf' })
    expect(hub('cycling')).toMatchObject({
      sport: 'road-bicycle-racing',
      path: '/sports/road-bicycle-racing',
      emoji: '🚲',
    })
    expect(hub('esports')).toMatchObject({ sport: 'esports' })
  })

  it('finds a sport by its leagues and other names', () => {
    expect(hub('ufc')).toMatchObject({ sport: 'mma', path: '/sports/mma' })
    expect(hub('formula one')).toMatchObject({ sport: 'f1' })
    expect(hub('premier league')).toMatchObject({ sport: 'soccer' })
    expect(hub('hockey')).toMatchObject({ sport: 'nhl' })
    expect(hub('ATP')).toMatchObject({ sport: 'tennis' })
  })

  it('finds a topic with a page under its sport', () => {
    expect(hub('super bowl')).toEqual({
      kind: 'topic',
      topicId: 'superbowl',
      sport: 'nfl',
      groupIds: ['superbowl'],
      path: '/sports/nfl/super-bowl',
      label: 'Super Bowl',
      emoji: '🏈',
    })
    // No emoji of its own: its sport's.
    expect(hub('tour de france')).toMatchObject({
      path: '/sports/road-bicycle-racing/tour-de-france',
      emoji: '🚲',
    })
    expect(hub('sports betting')).toMatchObject({
      kind: 'topic',
      path: '/sports/all/sports-betting',
    })
  })

  it('prefers a topic that groups sports to the sport with its label', () => {
    // The Football topic holds soccer and the NFL; the sport labelled
    // Football is the other American football leagues.
    expect(hub('football')).toMatchObject({
      kind: 'topic',
      path: '/sports/all/football',
      label: 'Football',
    })
    expect(hub('basketball')).toMatchObject({
      kind: 'topic',
      path: '/sports/all/basketball',
    })
  })

  it('prefers a topic named as typed to a league of the sport', () => {
    const withLeague = buildSportsIndex(
      [
        ...topics,
        {
          id: 'pl',
          slug: 'premier-league',
          name: 'Premier League',
          totalMembers: 9,
        },
      ],
      [{ parentId: soccer, childId: 'pl' }]
    )
    expect(findSportsHub('premier league', withLeague)).toMatchObject({
      kind: 'topic',
      path: '/sports/soccer/premier-league',
      emoji: '⚽',
    })
  })

  it('finds /sports for sports itself', () => {
    expect(hub('Sports')).toEqual({
      kind: 'all',
      path: '/sports',
      label: 'Sports',
      emoji: '🏟️',
    })
  })

  it('finds nothing for other searches', () => {
    expect(hub('')).toBeUndefined()
    expect(hub('lakers')).toBeUndefined()
    expect(hub('nba finals mvp')).toBeUndefined()
    expect(hub('will the nba expand')).toBeUndefined()
    expect(hub('games')).toBeUndefined()
    expect(hub('other')).toBeUndefined()
  })

  it('finds the curated sports before the topic tree has loaded', () => {
    const curated = { sports: CURATED_SPORTS }
    expect(findSportsHub('nba', curated)).toMatchObject({ sport: 'nba' })
    expect(findSportsHub('super bowl', curated)).toBeUndefined()
    expect(findSportsHub('football', curated)).toMatchObject({
      kind: 'sport',
      sport: 'football',
    })
  })
})

describe('sportsHubGames', () => {
  const games = (term: string) => {
    const hub = findSportsHub(term, index)
    return hub && sportsHubGames(hub, index)
  }

  it("takes a curated sport's games by league", () => {
    expect(games('nba')).toEqual({ sportsLeagues: ['NBA'] })
    expect(games('soccer')?.sportsLeagues).toContain('Premier League')
  })

  it("takes a topic's games by the topics its page covers", () => {
    expect(games('super bowl')).toEqual({ groupIds: ['superbowl'] })
    expect(games('football')?.groupIds).toEqual(
      expect.arrayContaining([football, soccer, nfl, 'superbowl'])
    )
  })

  it("takes another sport's games by its topics", () => {
    expect(games('cycling')?.groupIds).toEqual(
      expect.arrayContaining(['cycling', 'tdf'])
    )
  })

  it('takes every game for /sports', () => {
    expect(games('sports')).toEqual({})
  })
})

describe('sportsHubStatus', () => {
  const now = Date.UTC(2026, 10, 13, 20)
  const game = (status: ScheduleGame['status'], startTime: number) =>
    ({ status, startTime } as ScheduleGame)
  const nba = findSportsHub('nba', index)!

  it('counts live games and the rest of the sport as upcoming', () => {
    const status = sportsHubStatus(
      nba,
      {
        games: [
          game('live', now - HOUR_MS),
          game('live', now - 2 * HOUR_MS),
          game('upcoming', now + 3 * HOUR_MS),
        ],
        counts: { nba: 9, nfl: 4 },
        nextCursor: 'more',
      },
      now
    )
    expect(status).toEqual({
      live: 2,
      upcoming: 7,
      moreUpcoming: false,
      nextStart: now + 3 * HOUR_MS,
      noun: { one: 'game', many: 'games' },
    })
  })

  it("leaves a start that has passed out of what's next", () => {
    const status = sportsHubStatus(
      nba,
      {
        games: [game('upcoming', now - 1000), game('upcoming', now + HOUR_MS)],
        counts: { nba: 2 },
        nextCursor: null,
      },
      now
    )
    expect(status.nextStart).toBe(now + HOUR_MS)
    expect(status.upcoming).toBe(2)
  })

  it("counts a topic's listed games and says when there are more", () => {
    const status = sportsHubStatus(
      findSportsHub('super bowl', index)!,
      {
        games: [game('upcoming', now + HOUR_MS)],
        counts: { nfl: 12 },
        nextCursor: 'more',
      },
      now
    )
    expect(status).toMatchObject({ live: 0, upcoming: 1, moreUpcoming: true })
  })

  it('counts F1 sessions as its games', () => {
    const weekend = {
      sessions: [
        { status: 'finished', startTime: now - 30 * HOUR_MS },
        { status: 'live', startTime: now - HOUR_MS },
        { status: 'upcoming', startTime: now + 20 * HOUR_MS },
      ],
    } as RaceWeekend
    const status = sportsHubStatus(
      findSportsHub('f1', index)!,
      {
        games: [],
        raceWeekends: [weekend],
        counts: { f1: 2 },
        nextCursor: null,
      },
      now
    )
    expect(status).toEqual({
      live: 1,
      upcoming: 1,
      moreUpcoming: false,
      nextStart: now + 20 * HOUR_MS,
      noun: { one: 'session', many: 'sessions' },
    })
  })

  it('counts every sport for /sports', () => {
    const status = sportsHubStatus(
      findSportsHub('sports', index)!,
      {
        games: [game('live', now - HOUR_MS), game('upcoming', now + HOUR_MS)],
        counts: { nba: 3, nfl: 4 },
        nextCursor: 'more',
      },
      now
    )
    expect(status).toMatchObject({ live: 1, upcoming: 6, moreUpcoming: false })
  })

  it('calls soccer games matches', () => {
    expect(
      sportsHubStatus(
        findSportsHub('soccer', index)!,
        { games: [], counts: {}, nextCursor: null },
        now
      ).noun
    ).toEqual({ one: 'match', many: 'matches' })
  })
})
