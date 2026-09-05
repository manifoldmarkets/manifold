import {
  findRelatedMarkets,
  gameStatus,
  GameForMatching,
  isSameFixture,
  matchRelatedMarket,
  mentionsTeam,
  parseSportsStart,
  parseVersusQuestion,
  RelatedCandidate,
  relatedGroupFor,
  splitFlag,
  sportForMarket,
  teamAliases,
  teamDisplayName,
  versusAnswers,
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

describe('parseVersusQuestion / versusAnswers', () => {
  it('parses common matchup formats', () => {
    expect(parseVersusQuestion('Chiefs vs Bills')).toEqual({
      home: 'Chiefs',
      away: 'Bills',
    })
    expect(parseVersusQuestion('Arsenal v Chelsea (Premier League)')).toEqual({
      home: 'Arsenal',
      away: 'Chelsea',
    })
    expect(parseVersusQuestion('🇧🇷BRA vs 🇦🇷ARG [World Cup ’26]')).toEqual({
      home: 'BRA',
      away: 'ARG',
    })
    expect(parseVersusQuestion('Lakers @ Celtics: who wins?')).toEqual({
      home: 'Celtics',
      away: 'Lakers',
    })
  })
  it('rejects non-matchup questions', () => {
    expect(
      parseVersusQuestion('Will the Chiefs win the Super Bowl?')
    ).toBeNull()
    expect(parseVersusQuestion('Best team of 2026?')).toBeNull()
  })
  it('maps answers to sides, in either order, with an optional draw', () => {
    const sides = { home: 'Chiefs', away: 'Bills' }
    const r = versusAnswers(sides, [
      { text: 'Buffalo Bills' },
      { text: 'Kansas City Chiefs' },
    ])
    expect(r?.home.text).toBe('Kansas City Chiefs')
    expect(r?.away.text).toBe('Buffalo Bills')
    expect(r?.draw).toBeNull()
    const withDraw = versusAnswers({ home: 'Arsenal', away: 'Chelsea' }, [
      { text: 'Arsenal' },
      { text: 'Chelsea' },
      { text: 'Draw' },
    ])
    expect(withDraw?.draw?.text).toBe('Draw')
  })
  it('rejects answers that are not the two sides', () => {
    expect(
      versusAnswers({ home: 'Chiefs', away: 'Bills' }, [
        { text: 'Under 47.5' },
        { text: 'Over 47.5' },
      ])
    ).toBeNull()
    expect(
      versusAnswers({ home: 'Chiefs', away: 'Bills' }, [
        { text: 'Chiefs' },
        { text: 'Bills' },
        { text: 'Other' },
      ])
    ).toBeNull()
  })
})

describe('isSameFixture', () => {
  const game = {
    home: { name: 'Kansas City Chiefs', shortText: 'KC' },
    away: { name: 'Buffalo Bills', shortText: 'BUF' },
  }
  it('is true when both teams are mentioned', () => {
    expect(isSameFixture(game, 'Chiefs vs Bills: who wins?')).toBe(true)
  })
  it('is false with only one team', () => {
    expect(isSameFixture(game, 'Chiefs vs Eagles')).toBe(false)
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
  it('reads "A @ B" as A away at B', () => {
    expect(parseVersusQuestion('Lakers @ Celtics')).toEqual({
      home: 'Celtics',
      away: 'Lakers',
    })
  })
  it('keeps hyphenated names intact', () => {
    expect(parseVersusQuestion('Arsenal vs Saint-Etienne')).toEqual({
      home: 'Arsenal',
      away: 'Saint-Etienne',
    })
    expect(parseVersusQuestion('Arsenal vs Chelsea - who wins?')).toEqual({
      home: 'Arsenal',
      away: 'Chelsea',
    })
  })
  it('refuses ambiguous answer pairings', () => {
    expect(
      versusAnswers({ home: 'Los Angeles', away: 'Los Angeles' }, [
        { text: 'Los Angeles Lakers' },
        { text: 'Los Angeles Clippers' },
      ])
    ).toBeNull()
    const r = versusAnswers({ home: 'Lakers', away: 'Clippers' }, [
      { text: 'Los Angeles Clippers' },
      { text: 'Los Angeles Lakers' },
    ])
    expect(r?.home.text).toBe('Los Angeles Lakers')
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
