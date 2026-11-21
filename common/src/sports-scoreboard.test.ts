import { gameStatus, ScheduleGame } from './sports-schedule'
import {
  gameScoreLabel,
  publicSportsScoreSchema,
  scheduleScoreFields,
  scoreboardDetailLines,
} from './sports-scoreboard'

const game: ScheduleGame = {
  id: 'm',
  slug: 'game',
  creatorUsername: 'sports',
  question: 'Away at Home',
  sport: 'nba',
  league: 'NBA',
  sportsEventId: 'bdl:nba:1',
  startTime: 10,
  closeTime: 20,
  kickoffKnown: true,
  status: 'live',
  isResolved: false,
  winnerAnswerId: null,
  resolutionTime: null,
  home: {
    answerId: 'h',
    name: 'Home',
    shortName: 'H',
    flag: '',
    imageUrl: null,
    color: null,
    prob: 0.5,
  },
  away: {
    answerId: 'a',
    name: 'Away',
    shortName: 'A',
    flag: '',
    imageUrl: null,
    color: null,
    prob: 0.5,
  },
  draw: null,
  volume: 0,
  uniqueBettorCount: 0,
  liveScore: null,
  finalScore: null,
  related: [],
  relatedCount: 0,
}
const score = {
  sportsHomeScore: 0,
  sportsAwayScore: 7,
  sportsLiveStatus: 'IN_PLAY',
  sportsLiveMinute: null,
  sportsLiveUpdatedTime: 100,
}
it.each(['IN_PLAY', 'PAUSED', 'FINISHED', 'AWARDED'])(
  'keeps the legacy %s message unchanged',
  (status) => {
    const old = { ...score, sportsLiveStatus: status }
    expect(publicSportsScoreSchema.parse(old)).toEqual(old)
    expect(scheduleScoreFields(old, false)).toEqual({})
  }
)
it('publishes only known score fields, recursively; zeros and null periods remain distinguishable', () => {
  const data = {
    ...score,
    sportsLiveStatus: 'suspended',
    sportsLivePeriod: 0,
    sportsLiveClock: '0:00',
    sportsLiveDetail: {
      periodScores: [{ home: 0, away: null, privateKey: 'a' }],
      shots: { home: 0, away: 1, source: 'x' },
      outs: 0,
      rawPlays: ['private'],
    },
    sportsResumptionTime: 0,
    sportsFinalQualifier: 'SO',
    sportsAttentionReason: 'private',
    sportsVerification: { token: 'x' },
    sportsLeagueKey: 'mlb',
  }
  const safe = publicSportsScoreSchema.parse(data)
  expect(safe).not.toHaveProperty('sportsAttentionReason')
  expect(safe).not.toHaveProperty('sportsVerification')
  expect(safe).not.toHaveProperty('sportsLeagueKey')
  expect(scheduleScoreFields(data, false)).toEqual({
    gameState: 'suspended',
    period: 0,
    clock: '0:00',
    resumptionTime: 0,
    scoreboard: {
      periodScores: [{ home: 0, away: null }],
      shots: { home: 0, away: 1 },
      outs: 0,
    },
  })
  expect(JSON.stringify(safe)).not.toContain('private')
  expect(
    scheduleScoreFields({ ...data, sportsLiveStatus: 'in_progress' }, false)
  ).not.toHaveProperty('resumptionTime')
  expect(
    scheduleScoreFields(
      { sportsLiveDetail: { providerResponse: 'private' } },
      false
    )
  ).toEqual({})
})
it('exports only standings for the two market teams and drops invalid fields independently', () => {
  const source = {
    ...score,
    sportsLiveDetail: {
      outs: 0,
      standings: {
        home: { wins: 0, losses: 2, ties: 0, rank: 1, coachEmail: 'private' },
        away: { wins: 12, losses: 0, ties: -1, rank: 0, raw: 'private' },
        elsewhere: [{ name: 'omit' }],
        reference: 'private',
      },
    },
  }
  const approved = {
    home: { wins: 0, losses: 2, ties: 0, rank: 1 },
    away: { wins: 12, losses: 0 },
  }
  const projected = scheduleScoreFields(source, false).scoreboard
  expect(projected?.standings).toStrictEqual(approved)
  expect(publicSportsScoreSchema.parse(source).sportsLiveDetail).toStrictEqual({
    outs: 0,
    standings: approved,
  })
  for (const home of [
    { wins: 1 },
    { wins: -1, losses: 0 },
    { wins: 0, losses: 1.5 },
    { wins: 1001, losses: 0 },
    { wins: 0, losses: Infinity },
  ]) {
    const data = {
      ...score,
      sportsLiveDetail: { outs: 0, standings: { home, away: approved.away } },
    }
    expect(scheduleScoreFields(data, false).scoreboard).toStrictEqual({
      outs: 0,
      standings: { away: approved.away },
    })
  }
  for (const invalid of [
    null,
    [],
    { home: { wins: -1 }, away: {} },
    { leagues: [1] },
  ]) {
    const data = { ...score, sportsLiveDetail: { outs: 0, standings: invalid } }
    expect(publicSportsScoreSchema.parse(data).sportsLiveDetail).toStrictEqual({
      outs: 0,
    })
    expect(
      scheduleScoreFields(
        { ...score, sportsLiveDetail: { standings: invalid } },
        false
      )
    ).toEqual({})
  }
})

it('rejects malformed score/time and omits invalid stored optional details', () => {
  for (const extra of [
    { sportsHomeScore: Infinity },
    { sportsAwayScore: -1 },
    { sportsLiveUpdatedTime: NaN },
    { sportsLivePeriod: 'moderator notes' },
    { sportsLiveClock: 'secret text' },
    { sportsLiveDetail: { outs: 4 } },
    { sportsLiveDetail: { bases: [false, true] } },
    { sportsResumptionTime: Infinity },
    { sportsFinalQualifier: 'guess' },
    { sportsLiveStatus: 'unreviewed' },
  ])
    expect(
      publicSportsScoreSchema.safeParse({ ...score, ...extra }).success
    ).toBe(false)
  expect(
    scheduleScoreFields(
      {
        sportsLiveStatus: 'delayed',
        sportsLiveClock: 'raw',
        sportsLiveDetail: { shots: { home: -1, away: 0 } },
      },
      false
    )
  ).toEqual({ gameState: 'delayed' })
})
it('keeps unknown, abandoned, and administrative states neutral past close and hides the reason', () => {
  for (const raw of [
    'UNKNOWN',
    'abandoned',
    'NEEDS_ATTENTION',
    'needs-attention',
    'new provider text',
    undefined,
  ]) {
    const fields = scheduleScoreFields(
      {
        sportsProvider: 'bdl',
        sportsLiveStatus: raw,
        sportsAttentionReason: 'must never be public',
      },
      false
    )
    expect(fields).toEqual({ gameState: 'unavailable' })
    expect(gameStatus({ ...game, ...fields, now: 500 })).toBe('upcoming')
    expect(gameScoreLabel({ ...game, ...fields })).toBe('Awaiting update')
  }
  expect(
    publicSportsScoreSchema.parse({
      ...score,
      sportsLiveStatus: 'NEEDS_ATTENTION',
    }).sportsLiveStatus
  ).toBe('UNKNOWN')
})
it('separates reported final from paid final, and keeps delayed games visible after close', () => {
  for (const raw of [
    'delayed',
    'postponed',
    'suspended',
    'scheduled',
    'final',
  ]) {
    const fields = scheduleScoreFields(
      { sportsLiveStatus: raw, sportsFinalQualifier: 'SO' },
      false
    )
    expect(gameStatus({ ...game, ...fields, now: 500 })).toBe('upcoming')
  }
  const during = scheduleScoreFields(
    { sportsLiveStatus: 'FINAL', sportsFinalQualifier: 'SO' },
    false
  )
  expect(gameScoreLabel({ ...game, ...during })).toBe('Final · checking result')
  const paid = scheduleScoreFields(
    { sportsLiveStatus: 'FINAL', sportsFinalQualifier: 'SO' },
    true
  )
  expect(gameScoreLabel({ ...game, ...paid, isResolved: true })).toBe(
    'Final · SO'
  )
  expect(gameStatus({ ...game, ...paid, isResolved: true, now: 5 })).toBe(
    'finished'
  )
  expect(
    gameScoreLabel(
      { ...game, gameState: 'suspended', resumptionTime: 0 },
      () => 'Jul 5'
    )
  ).toBe('Suspended · resumes Jul 5')
  expect(gameScoreLabel({ ...game, gameState: 'canceled' })).toBe('Canceled')
  expect(gameStatus({ ...game, kickoffKnown: false, now: 15 })).toBe('upcoming')
})
it('labels distinct sports periods, clock, zero, and the old soccer minute', () => {
  expect(gameScoreLabel({ ...game, period: 2, clock: '4:12' })).toBe('Q2 4:12')
  expect(gameScoreLabel({ ...game, sport: 'nhl', period: 2 })).toBe('P2')
  expect(
    gameScoreLabel({
      ...game,
      sport: 'mlb',
      period: 7,
      scoreboard: { inningHalf: 'top' },
    })
  ).toBe('Top 7th')
  expect(
    gameScoreLabel({
      ...game,
      sport: 'mlb',
      period: 11,
      scoreboard: { inningHalf: 'bottom' },
    })
  ).toBe('Bottom 11th')
  for (const [minute, expected] of [
    ['67', '67′'],
    ['45+4', '45+4′'],
    ['HT', 'HT'],
    ['0', '0′'],
  ])
    expect(
      gameScoreLabel({
        ...game,
        sport: 'soccer',
        liveScore: { home: 0, away: 0, minute, status: 'IN_PLAY' },
      })
    ).toBe(expected)
  expect(
    gameScoreLabel({ ...game, gameState: 'scheduled', kickoffKnown: false })
  ).toBeNull()
})
it('renders only present, sport-appropriate detail with the correct team identity and zero', () => {
  const scoreboard = {
    periodScores: [{ home: 0, away: null }],
    shots: { home: 0, away: 3 },
    inningHalf: 'top' as const,
    bases: [false, true, false] as [boolean, boolean, boolean],
    outs: 0,
    down: 2,
    yardsToGo: 0,
    redCards: { home: 1, away: 0 },
  }
  const lines = (sport: string) =>
    scoreboardDetailLines({ ...game, sport, scoreboard })
  expect(lines('nba')).toEqual(['Q1 · H 0'])
  expect(lines('nhl')).toEqual(['P1 · H 0', 'Shots · H 0, A 3'])
  expect(lines('mlb')).toEqual(['0 outs', 'On base · 2nd'])
  expect(lines('nfl')).toEqual(['Q1 · H 0', '2nd & 0'])
  expect(lines('soccer')).toEqual(['Red cards · H 1, A 0'])
  expect(
    scoreboardDetailLines({
      ...game,
      sport: 'mlb',
      scoreboard: { bases: [false, false, false] },
    })
  ).toEqual(['Bases empty'])
  expect(
    scoreboardDetailLines({
      ...game,
      scoreboard: { periodScores: [{ home: null, away: null }] },
    })
  ).toEqual([])
})
