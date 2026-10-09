import {
  buildSportsIndex,
  CURATED_SPORTS,
  findRelatedMarkets,
  gameStatus,
  GameForMatching,
  matchRelatedMarket,
  mentionsTeam,
  NBA_TOPIC_ID,
  parseSportsStart,
  RelatedCandidate,
  relatedGroupFor,
  splitFlag,
  sportForMarket,
  SPORTS_DEFAULT_GROUP_ID,
  SportsTopic,
  SportsTopicLink,
  sportTagIds,
  splitTopicName,
  teamAliases,
  teamDisplayName,
} from './sports-schedule'
import { DAY_MS, HOUR_MS } from './util/time'

describe('parseSportsStart', () => {
  it('parses football-data ISO timestamps with a Z suffix', () => {
    expect(parseSportsStart('2026-06-11T19:00:00Z')).toBe(
      Date.UTC(2026, 5, 11, 19)
    )
  })
  it('treats naive TheSportsDB timestamps as UTC', () => {
    expect(parseSportsStart('2026-09-07T17:00:00')).toBe(
      Date.UTC(2026, 8, 7, 17)
    )
  })
  it('returns null for garbage', () => {
    expect(parseSportsStart('')).toBeNull()
    expect(parseSportsStart('not a date')).toBeNull()
    expect(parseSportsStart(undefined)).toBeNull()
  })
})

describe('splitFlag', () => {
  it('splits a flag-prefixed name', () => {
    expect(splitFlag('🇧🇷 Brazil')).toEqual({ flag: '🇧🇷', name: 'Brazil' })
    expect(splitFlag('🇰🇷KOR')).toEqual({ flag: '🇰🇷', name: 'KOR' })
  })
  it('leaves plain names alone', () => {
    expect(splitFlag('Kansas City Chiefs')).toEqual({
      flag: '',
      name: 'Kansas City Chiefs',
    })
  })
})

describe('teamAliases / mentionsTeam', () => {
  it('derives nickname, city and abbreviation aliases', () => {
    const aliases = teamAliases('Kansas City Chiefs', 'KC').map((a) => a.alias)
    expect(aliases).toEqual(['Kansas City Chiefs', 'Chiefs'])
  })
  it('does not use generic trailing words as aliases', () => {
    const aliases = teamAliases('Manchester United').map((a) => a.alias)
    expect(aliases).toEqual(['Manchester United'])
  })
  it('matches whole words only', () => {
    const jets = teamAliases('New York Jets', 'NYJ')
    expect(mentionsTeam('Will the Jets win by 7+?', jets)).toBe(true)
    expect(mentionsTeam('Will private jets be banned?', jets)).toBe(true) // case-insensitive nickname
    expect(mentionsTeam('Jetstream forecast', jets)).toBe(false)
  })
  it('requires short abbreviations to be upper case', () => {
    const chiefs = teamAliases('Kansas City Chiefs', 'KAN')
    expect(mentionsTeam('KAN -3.5 vs BUF?', chiefs)).toBe(true)
    expect(mentionsTeam('will kan barbecue be good', chiefs)).toBe(false)
  })
  it('ignores two-letter codes and ticker-style prefixes', () => {
    const saints = teamAliases('New Orleans Saints', 'NO')
    expect(saints.map((a) => a.alias)).toEqual(['New Orleans Saints', 'Saints'])
    expect(mentionsTeam('Will NO team score 50+?', saints)).toBe(false)
    const chiefs = teamAliases('Kansas City Chiefs', 'KAN')
    expect(mentionsTeam('$KAN to the moon', chiefs)).toBe(false)
    // A community market whose answer is literally the code keeps it.
    expect(teamAliases('LA', 'LA').map((a) => a.alias)).toEqual(['LA'])
  })
  it('strips flags before matching', () => {
    const brazil = teamAliases('🇧🇷 Brazil', '🇧🇷BRA')
    expect(mentionsTeam('Will Brazil score 3+ goals?', brazil)).toBe(true)
    expect(mentionsTeam('BRA clean sheet?', brazil)).toBe(true)
  })
})

describe('matchRelatedMarket', () => {
  const kickoff = Date.UTC(2026, 8, 13, 17)
  const game: GameForMatching = {
    id: 'game1',
    sport: 'nfl',
    sportsEventId: 'tsdb-123',
    startTime: kickoff,
    home: { name: 'Kansas City Chiefs', shortText: 'KC' },
    away: { name: 'Buffalo Bills', shortText: 'BUF' },
  }
  const candidate = (
    over: Partial<RelatedCandidate> & { question: string }
  ): RelatedCandidate => ({
    id: 'c',
    closeTime: kickoff + 3 * HOUR_MS,
    sport: 'nfl',
    importanceScore: 0.5,
    ...over,
  })

  it('links official props sharing the sportsEventId', () => {
    expect(
      matchRelatedMarket(
        game,
        candidate({ question: 'Total points', sportsEventId: 'tsdb-123' })
      )
    ).toEqual({ id: 'c', kind: 'official', group: 'game-lines', score: 3 })
  })
  it('never links a different game', () => {
    expect(
      matchRelatedMarket(
        game,
        candidate({ question: 'Chiefs vs Bills', sportsEventId: 'tsdb-999' })
      )
    ).toBeNull()
  })
  it('never links the game to itself', () => {
    expect(
      matchRelatedMarket(
        game,
        candidate({ id: 'game1', question: 'Chiefs vs Bills' })
      )
    ).toBeNull()
  })
  it('links a both-teams market closing weeks before kickoff', () => {
    expect(
      matchRelatedMarket(
        game,
        candidate({
          question: 'Chiefs vs Bills: over 47.5 total points?',
          closeTime: kickoff - 10 * DAY_MS,
        })
      )
    ).toEqual({ id: 'c', kind: 'both-teams', group: 'game-lines', score: 2 })
  })
  it('links a one-team market only close to kickoff', () => {
    expect(
      matchRelatedMarket(
        game,
        candidate({ question: 'Will Mahomes throw 300+ yards for the Chiefs?' })
      )
    ).toEqual({ id: 'c', kind: 'one-team', group: 'props', score: 1 })
    expect(
      matchRelatedMarket(
        game,
        candidate({
          question: 'Will the Chiefs win the Super Bowl?',
          closeTime: kickoff + 120 * DAY_MS,
        })
      )
    ).toBeNull()
  })
  it('ignores same-nickname teams from another sport', () => {
    const giants: GameForMatching = {
      ...game,
      home: { name: 'New York Giants', shortText: 'NYG' },
    }
    expect(
      matchRelatedMarket(
        giants,
        candidate({ question: 'Giants to win the NL West?', sport: 'mlb' })
      )
    ).toBeNull()
    expect(
      matchRelatedMarket(
        giants,
        candidate({ question: 'Giants to cover the spread?', sport: 'other' })
      )
    ).toEqual({ id: 'c', kind: 'one-team', group: 'game-lines', score: 1 })
  })
  it('orders related markets by match strength then importance', () => {
    const related = findRelatedMarkets(game, [
      candidate({
        id: 'one',
        question: 'Bills to score first?',
        importanceScore: 0.9,
      }),
      candidate({
        id: 'both',
        question: 'Chiefs vs Bills total > 50?',
        importanceScore: 0.1,
      }),
      candidate({
        id: 'off',
        question: 'Spread',
        sportsEventId: 'tsdb-123',
        importanceScore: 0,
      }),
      candidate({
        id: 'none',
        question: 'Will it rain in Kansas?',
        importanceScore: 1,
      }),
    ])
    expect(related.map((r) => r.id)).toEqual(['off', 'both', 'one'])
  })
})

describe('sportForMarket', () => {
  it('prefers the league stamp', () => {
    expect(sportForMarket({ sportsLeague: 'NFL' })).toBe('nfl')
    expect(sportForMarket({ sportsLeague: 'English Premier League' })).toBe(
      'soccer'
    )
    expect(sportForMarket({ sportsLeague: 'FIFA World Cup' })).toBe('soccer')
  })
  it('falls back to topics, then other', () => {
    expect(sportForMarket({ groupIds: ['i0v3cXwuxmO9fpcInVYb'] })).toBe('nba')
    expect(sportForMarket({ groupIds: ['nope'] })).toBe('other')
  })
})

describe('gameStatus', () => {
  const start = 1_000_000
  const close = start + 3 * HOUR_MS
  it('is upcoming before kickoff', () => {
    expect(
      gameStatus({
        startTime: start,
        closeTime: close,
        isResolved: false,
        now: start - 1,
      })
    ).toBe('upcoming')
  })
  it('is live between kickoff and close', () => {
    expect(
      gameStatus({
        startTime: start,
        closeTime: close,
        isResolved: false,
        now: start + 1,
      })
    ).toBe('live')
  })
  it('is live when the live poller says so, even after the close-time window', () => {
    expect(
      gameStatus({
        startTime: start,
        closeTime: close,
        isResolved: false,
        liveStatus: 'IN_PLAY',
        liveUpdatedTime: close + 1,
        now: close + 2,
      })
    ).toBe('live')
  })
  it('is finished once resolved or past close', () => {
    expect(
      gameStatus({
        startTime: start,
        closeTime: close,
        isResolved: true,
        now: start + 1,
      })
    ).toBe('finished')
    expect(
      gameStatus({
        startTime: start,
        closeTime: close,
        isResolved: false,
        now: close + 1,
      })
    ).toBe('finished')
  })
})

describe('teamDisplayName', () => {
  it('shortens long names to the nickname', () => {
    expect(teamDisplayName('Kansas City Chiefs')).toBe('Chiefs')
    expect(teamDisplayName('Golden State Warriors')).toBe('Warriors')
  })
  it('keeps short names and generic-suffix names', () => {
    expect(teamDisplayName('Arsenal')).toBe('Arsenal')
    expect(teamDisplayName('Manchester United')).toBe('Manchester United')
  })
  it('drops flags', () => {
    expect(teamDisplayName('🇧🇷 Brazil')).toBe('Brazil')
  })
})

describe('relatedGroupFor', () => {
  it('spots main lines', () => {
    expect(
      relatedGroupFor({
        question: 'Chiefs vs Bills: over 47.5 total points?',
        kind: 'both-teams',
      })
    ).toBe('game-lines')
    expect(
      relatedGroupFor({
        question: 'Will the Chiefs cover -3.5?',
        kind: 'one-team',
      })
    ).toBe('game-lines')
    expect(
      relatedGroupFor({ question: 'Both teams to score?', kind: 'official' })
    ).toBe('game-lines')
  })
  it('spots props', () => {
    expect(
      relatedGroupFor({
        question: 'Will Mahomes throw for 300+ yards?',
        kind: 'one-team',
      })
    ).toBe('props')
    expect(
      relatedGroupFor({ question: 'First goal scorer?', kind: 'both-teams' })
    ).toBe('props')
  })
  it('defaults official markets to props and the rest to community', () => {
    expect(
      relatedGroupFor({ question: 'Something odd', kind: 'official' })
    ).toBe('props')
    expect(
      relatedGroupFor({
        question: 'Will the stadium sell out?',
        kind: 'one-team',
      })
    ).toBe('community')
  })
})

describe('review follow-ups', () => {
  it('does not treat a shared city as a team mention', () => {
    const lakers = teamAliases('Los Angeles Lakers', 'LAL')
    expect(
      mentionsTeam('Will the Los Angeles Clippers win 50 games?', lakers)
    ).toBe(false)
    expect(mentionsTeam('Will the Lakers win 50 games?', lakers)).toBe(true)
  })
  it('knows two-word nicknames', () => {
    const sox = teamAliases('Boston Red Sox', 'BOS').map((a) => a.alias)
    expect(sox).toContain('Red Sox')
    expect(sox).not.toContain('Sox')
    const leafs = teamAliases('Toronto Maple Leafs').map((a) => a.alias)
    expect(leafs).toContain('Leafs')
    expect(teamAliases('Chicago White Sox').map((a) => a.alias)).toContain(
      'White Sox'
    )
  })
  it('files player stat lines as props, handicaps as game lines', () => {
    expect(
      relatedGroupFor({
        question: 'Will Mahomes throw for 300.5+ yards?',
        kind: 'one-team',
      })
    ).toBe('props')
    expect(
      relatedGroupFor({ question: 'Chiefs -3.5 vs Bills?', kind: 'both-teams' })
    ).toBe('game-lines')
    expect(
      relatedGroupFor({
        question: 'Will the total be over 210 points?',
        kind: 'both-teams',
      })
    ).toBe('game-lines')
  })
  it('treats a poller FINISHED status as finished even before resolution', () => {
    expect(
      gameStatus({
        startTime: 0,
        closeTime: 10 * HOUR_MS,
        isResolved: false,
        liveStatus: 'FINISHED',
        liveUpdatedTime: HOUR_MS,
        now: 2 * HOUR_MS,
      })
    ).toBe('finished')
  })
  it('keeps national team names with connectives whole on phones', () => {
    expect(teamDisplayName('Bosnia and Herzegovina')).toBe(
      'Bosnia and Herzegovina'
    )
    expect(teamDisplayName('Trinidad and Tobago')).toBe('Trinidad and Tobago')
  })
})

describe('second review round', () => {
  it('picks the college sport whatever order the topics arrive in', () => {
    const basketball = 'NjkFkdkvRvBHoeMDQ5NB'
    const college = 'beeb69e0-b36f-451a-80e1-e059df456bb1'
    expect(sportForMarket({ groupIds: [basketball, college] })).toBe('ncaab')
    expect(sportForMarket({ groupIds: [college, basketball] })).toBe('ncaab')
    expect(sportForMarket({ groupIds: [basketball] })).toBe('nba')
  })
  it('does not read a date as a handicap', () => {
    expect(
      relatedGroupFor({
        question: 'Arsenal vs Chelsea: first goal scorer? [2026-09-13]',
        kind: 'both-teams',
      })
    ).toBe('props')
    expect(
      relatedGroupFor({
        question: 'Arsenal vs Chelsea on 9/13: attendance above 60,000?',
        kind: 'both-teams',
      })
    ).toBe('community')
    expect(
      relatedGroupFor({ question: 'Bills +3.5 at Chiefs?', kind: 'both-teams' })
    ).toBe('game-lines')
  })
})

describe('pipeline handoff fields', () => {
  it('maps The Odds API sport keys to a sport', () => {
    expect(sportForMarket({ sportsLeague: 'americanfootball_nfl' })).toBe('nfl')
    expect(sportForMarket({ sportsLeague: 'americanfootball_ncaaf' })).toBe(
      'ncaaf'
    )
    expect(sportForMarket({ sportsLeague: 'basketball_nba' })).toBe('nba')
    expect(sportForMarket({ sportsLeague: 'basketball_wnba' })).toBe('nba')
    expect(sportForMarket({ sportsLeague: 'basketball_ncaab' })).toBe('ncaab')
    expect(sportForMarket({ sportsLeague: 'baseball_mlb' })).toBe('mlb')
    expect(sportForMarket({ sportsLeague: 'icehockey_nhl' })).toBe('nhl')
    expect(sportForMarket({ sportsLeague: 'soccer_epl' })).toBe('soccer')
    expect(sportForMarket({ sportsLeague: 'soccer_uefa_champs_league' })).toBe(
      'soccer'
    )
    expect(sportForMarket({ sportsLeague: 'mma_mixed_martial_arts' })).toBe(
      'mma'
    )
    expect(sportForMarket({ sportsLeague: 'boxing_boxing' })).toBe('other')
  })
  it('tags WNBA games with basketball but not the NBA topic', () => {
    const nba = sportTagIds('nba', 'NBA')
    const wnba = sportTagIds('nba', 'WNBA')
    expect(nba).toContain(NBA_TOPIC_ID)
    expect(wnba).toEqual(nba.filter((id) => id !== NBA_TOPIC_ID))
    expect(wnba.length).toBeGreaterThan(1)
  })
  it('files a market by its stamped sportsMarketType before guessing', () => {
    expect(
      relatedGroupFor({
        question: 'Chiefs vs Bills: something unusual',
        kind: 'official',
        marketType: 'spread',
      })
    ).toBe('game-lines')
    expect(
      relatedGroupFor({
        question: 'Will the total be over 47.5?',
        kind: 'official',
        marketType: 'prop',
      })
    ).toBe('props')
    expect(
      relatedGroupFor({
        question: 'Will the total be over 47.5?',
        kind: 'official',
        marketType: null,
      })
    ).toBe('game-lines')
  })
})

describe('sports from the topic tree', () => {
  // A slice of the prod tree under 🏟️ Sports.
  const root = SPORTS_DEFAULT_GROUP_ID
  const football = 'Vcf6CYTTSXAiStbKSqQq'
  const soccer = 'ypd6vR44ZzJyN9xykx6e'
  const nfl = 'TNQwmbE5p6dnKx2e6Qlp'
  const collegeFootball = 'ky1VPTuxrLXMnHyajZFp'
  const basketball = 'NjkFkdkvRvBHoeMDQ5NB'
  const collegeBasketball = 'beeb69e0-b36f-451a-80e1-e059df456bb1'
  const sportsBetting = 'b3ll9Ch9rdbcrTRAbjUf'
  const mma = 'VAI9srd7zaNEvJ1iYLO1'
  const formula1 = 'OyHBKJOz9YaGkDctpwuY'
  const topics: SportsTopic[] = [
    [soccer, 'soccer', '⚽ Soccer', 8951],
    [sportsBetting, 'sports-betting', 'Sports Betting', 6163],
    [basketball, 'basketball', '🏀 Basketball', 5484],
    [collegeBasketball, 'college-basketball', '🏀 College Basketball', 3101],
    [nfl, 'nfl', '🏈 NFL', 4902],
    ['superbowl', 'super-bowl', '🏈 Super Bowl', 684],
    [football, 'football', '⚽ 🏈 Football', 2818],
    [collegeFootball, 'college-football', 'College Football', 2518],
    ['cycling', 'road-bicycle-racing', '🚲  Cycling', 1719],
    ['tdf', 'tour-de-france', 'Tour de France', 73],
    ['womens', 'peloton-discord-65dd39510b70', 'Womens Cycling', 14],
    ['esports', 'esports', 'Esports', 204],
    ['motorsports', 'motorsports', 'Motorsports', 120],
    [formula1, 'formula-1', '🏎️ Formula 1', 3055],
    ['combat', 'combat-sports', 'Combat Sports', 72],
    [mma, 'mma', 'MMA', 54],
    ['boxing', 'boxing', 'Boxing', 48],
    ['sumo', 'sumo', 'Sumo', 13],
  ].map(([id, slug, name, totalMembers]) => ({
    id: id as string,
    slug: slug as string,
    name: name as string,
    totalMembers: totalMembers as number,
  }))
  const links: SportsTopicLink[] = [
    [root, soccer],
    [root, sportsBetting],
    [root, basketball],
    [root, nfl],
    [root, football],
    [root, 'cycling'],
    [root, 'womens'],
    [root, 'esports'],
    [root, 'motorsports'],
    [root, 'combat'],
    [root, 'sumo'],
    [football, soccer],
    [football, nfl],
    [football, collegeFootball],
    [basketball, collegeBasketball],
    [nfl, 'superbowl'],
    ['cycling', 'tdf'],
    ['cycling', 'womens'],
    ['motorsports', formula1],
    ['combat', mma],
    ['combat', 'boxing'],
    ['combat', 'sumo'],
  ].map(([parentId, childId]) => ({ parentId, childId }))
  const index = buildSportsIndex(topics, links)
  const sportOf = (...groupIds: string[]) => sportForMarket({ groupIds }, index)

  it('lists every curated sport, then a sport per other subtopic, biggest first', () => {
    expect(index.sports.map((s) => s.key)).toEqual([
      ...CURATED_SPORTS.map((s) => s.key),
      'road-bicycle-racing',
      'esports',
      'motorsports',
      'combat-sports',
    ])
  })

  it('takes the chip from the topic', () => {
    const cycling = index.sports.find((s) => s.key === 'road-bicycle-racing')
    expect(cycling).toMatchObject({
      label: 'Cycling',
      emoji: '🚲',
      slug: 'road-bicycle-racing',
      groupIds: ['cycling'],
    })
    expect(splitTopicName('Esports', 'esports')).toEqual({
      emoji: '🎮',
      label: 'Esports',
    })
    expect(splitTopicName('Curling', 'curling').emoji).toBe('🏅')
    expect(splitTopicName('pickleball', 'pickleball').label).toBe('Pickleball')
  })

  it('files markets deeper in the tree under their sport', () => {
    expect(sportOf('tdf')).toBe('road-bicycle-racing')
    expect(sportOf('womens')).toBe('road-bicycle-racing')
    expect(sportOf('sumo')).toBe('combat-sports')
    expect(sportOf('boxing')).toBe('combat-sports')
    expect(sportOf('superbowl')).toBe('nfl')
  })

  it('lets a curated sport beat the topic around it', () => {
    expect(sportOf('combat', mma)).toBe('mma')
    expect(sportOf('motorsports', formula1)).toBe('f1')
    expect(sportOf(basketball, collegeBasketball)).toBe('ncaab')
    expect(sportOf(collegeFootball, football)).toBe('ncaaf')
  })

  it('never files a market by a topic that groups sports', () => {
    expect(sportOf(football, soccer)).toBe('soccer')
    expect(sportOf(football)).toBe('other')
    expect(sportOf(sportsBetting)).toBe('other')
    expect(index.allGroupIds).toEqual(
      expect.arrayContaining([root, football, sportsBetting, 'tdf'])
    )
  })

  it('no longer reads Football + Soccer as NFL without the tree either', () => {
    expect(sportForMarket({ groupIds: [football, soccer] })).toBe('soccer')
    expect(sportForMarket({ groupIds: [football, nfl] })).toBe('nfl')
    // New NFL games are still tagged with the Football topic.
    expect(sportTagIds('nfl')).toContain(football)
  })

  it('claims a topic by slug where ids differ, as on dev', () => {
    const dev = buildSportsIndex(
      [{ id: 'dev-nhl', slug: 'nhl', name: 'NHL', totalMembers: 2 }],
      [{ parentId: root, childId: 'dev-nhl' }]
    )
    expect(dev.sports.map((s) => s.key)).toEqual(
      CURATED_SPORTS.map((s) => s.key)
    )
    expect(sportForMarket({ groupIds: ['dev-nhl'] }, dev)).toBe('nhl')
  })

  it('keeps reserved and odd slugs out of the keys, and survives cycles', () => {
    const odd = buildSportsIndex(
      [
        { id: 'a', slug: 'other', name: 'Other', totalMembers: 5 },
        { id: 'Bx', slug: 'Polo', name: 'Polo', totalMembers: 4 },
        { id: 'c', slug: 'loop', name: 'Loop', totalMembers: 3 },
      ],
      [
        { parentId: root, childId: 'a' },
        { parentId: root, childId: 'Bx' },
        { parentId: root, childId: 'c' },
        { parentId: 'c', childId: 'Bx' },
        { parentId: 'Bx', childId: 'c' },
      ]
    )
    expect(odd.sports.slice(CURATED_SPORTS.length).map((s) => s.key)).toEqual([
      'topic-a',
      'polo',
    ])
    expect(sportForMarket({ groupIds: ['c'] }, odd)).toBe('polo')
  })
})
