import {
  americanOddsToProb,
  buildOddsMarketParams,
  fairWinProb,
  isThreeWay,
  OddsApiEvent,
  oddsEventId,
  parseOddsEventId,
  resolveWinner,
  teamScores,
} from './odds-markets'
import {
  activeCalendarEntries,
  calendarEntriesFor,
  calendarStatus,
  SPORTS_CALENDAR,
} from './sports-calendar'

const nflEvent: OddsApiEvent = {
  id: 'abc123',
  sport_key: 'americanfootball_nfl',
  sport_title: 'NFL',
  commence_time: '2026-09-13T17:00:00Z',
  home_team: 'Kansas City Chiefs',
  away_team: 'Buffalo Bills',
  bookmakers: [
    {
      key: 'draftkings',
      title: 'DraftKings',
      last_update: '',
      markets: [
        {
          key: 'h2h',
          last_update: '',
          outcomes: [
            { name: 'Kansas City Chiefs', price: -150 },
            { name: 'Buffalo Bills', price: 130 },
          ],
        },
      ],
    },
    {
      key: 'fanduel',
      title: 'FanDuel',
      last_update: '',
      markets: [
        {
          key: 'h2h',
          last_update: '',
          outcomes: [
            { name: 'Kansas City Chiefs', price: -140 },
            { name: 'Buffalo Bills', price: 120 },
          ],
        },
      ],
    },
  ],
}

const soccerEvent: OddsApiEvent = {
  ...nflEvent,
  id: 'def456',
  sport_key: 'soccer_epl',
  sport_title: 'EPL',
  home_team: 'Arsenal',
  away_team: 'Chelsea',
  bookmakers: [
    {
      key: 'bet365',
      title: 'bet365',
      last_update: '',
      markets: [
        {
          key: 'h2h',
          last_update: '',
          outcomes: [
            { name: 'Arsenal', price: -120 },
            { name: 'Chelsea', price: 320 },
            { name: 'Draw', price: 260 },
          ],
        },
      ],
    },
  ],
}

describe('odds maths', () => {
  it('converts American odds to implied probability', () => {
    expect(americanOddsToProb(-150)).toBeCloseTo(0.6)
    expect(americanOddsToProb(150)).toBeCloseTo(0.4)
    expect(americanOddsToProb(100)).toBeCloseTo(0.5)
  })
  it('devigs and averages across bookmakers', () => {
    const p = fairWinProb(nflEvent, 'Kansas City Chiefs')!
    expect(p).toBeGreaterThan(0.55)
    expect(p).toBeLessThan(0.6)
    const q = fairWinProb(nflEvent, 'Buffalo Bills')!
    expect(p + q).toBeCloseTo(1, 5)
  })
  it('works for a three-way soccer market', () => {
    const home = fairWinProb(soccerEvent, 'Arsenal')!
    const away = fairWinProb(soccerEvent, 'Chelsea')!
    const draw = fairWinProb(soccerEvent, 'Draw')!
    expect(home + away + draw).toBeCloseTo(1, 5)
  })
  it('returns null without h2h data', () => {
    expect(fairWinProb({ ...nflEvent, bookmakers: [] }, 'x')).toBeNull()
  })
})

describe('event ids', () => {
  it('round-trips', () => {
    const id = oddsEventId('americanfootball_nfl', 'abc123')
    expect(id).toBe('odds:americanfootball_nfl:abc123')
    expect(parseOddsEventId(id)).toEqual({
      sportKey: 'americanfootball_nfl',
      eventId: 'abc123',
    })
  })
  it('rejects other providers and malformed ids', () => {
    expect(parseOddsEventId('fd-12345')).toBeNull()
    expect(parseOddsEventId('odds:nokey')).toBeNull()
    expect(parseOddsEventId('odds::x')).toBeNull()
    expect(parseOddsEventId(null)).toBeNull()
  })
})

describe('scores', () => {
  const score = {
    id: 'abc123',
    sport_key: 'americanfootball_nfl',
    sport_title: 'NFL',
    commence_time: '',
    completed: true,
    home_team: 'Kansas City Chiefs',
    away_team: 'Buffalo Bills',
    scores: [
      { name: 'Buffalo Bills', score: '24' },
      { name: 'Kansas City Chiefs', score: '27' },
    ],
    last_update: null,
  }
  it('picks the winner whatever order the scores arrive in', () => {
    expect(resolveWinner(score)).toBe('Kansas City Chiefs')
    expect(teamScores(score)).toEqual({ home: 27, away: 24 })
  })
  it('treats a tie and missing scores as no winner', () => {
    expect(
      resolveWinner({
        ...score,
        scores: [
          { name: 'Buffalo Bills', score: '20' },
          { name: 'Kansas City Chiefs', score: '20' },
        ],
      })
    ).toBeNull()
    expect(resolveWinner({ ...score, completed: false })).toBeNull()
    expect(resolveWinner({ ...score, scores: null })).toBeNull()
  })
})

describe('the market a game becomes', () => {
  const nfl = calendarEntriesFor('nfl-regular-2026')[0]
  const epl = calendarEntriesFor('epl-2026-27')[0]
  it('is binary for the NFL, seeded from the moneyline', () => {
    const p = buildOddsMarketParams(nflEvent, nfl)
    expect(p.outcomeType).toBe('BINARY')
    expect(p.answers).toBeUndefined()
    expect(p.initialProb).toBeGreaterThan(50)
    expect(p.question).toMatch(/^Buffalo Bills at Kansas City Chiefs \[/)
    expect(p.sportsEventId).toBe('odds:americanfootball_nfl:abc123')
    expect(p.sportsStartTimestamp).toBe('2026-09-13T17:00:00Z')
    expect(p.sportsLeague).toBe('NFL')
    expect(p.sportsHomeTeam).toBe('Kansas City Chiefs')
    expect(p.sportsAwayTeam).toBe('Buffalo Bills')
    expect(p.sportsMarketType).toBe('moneyline')
    expect(p.closeTime).toBe(Date.parse('2026-09-13T21:00:00Z'))
  })
  it('is three-way for soccer with the Draw last', () => {
    expect(isThreeWay(epl)).toBe(true)
    const p = buildOddsMarketParams(soccerEvent, epl)
    expect(p.outcomeType).toBe('MULTIPLE_CHOICE')
    expect(p.answers).toEqual(['Arsenal', 'Chelsea', 'Draw'])
    expect(p.question).toMatch(/^Arsenal vs Chelsea \[/)
    expect(p.sportsLeague).toBe('Soccer')
  })
  it('lets a calendar entry override the tie rule', () => {
    expect(isThreeWay({ sport: 'nfl', tiesAllowed: true })).toBe(true)
    expect(isThreeWay({ sport: 'soccer', tiesAllowed: false })).toBe(false)
  })
  it('opens at 50% with no moneyline', () => {
    const p = buildOddsMarketParams({ ...nflEvent, bookmakers: [] }, nfl)
    expect(p.initialProb).toBe(50)
  })
})

describe('sports calendar', () => {
  it('has unique phases and a sport key where the provider covers it', () => {
    const keys = SPORTS_CALENDAR.map((e) => `${e.competitionId}/${e.phase}`)
    expect(new Set(keys).size).toBe(keys.length)
    expect(calendarEntriesFor('nfl-regular-2026')[0].oddsKey).toBe(
      'americanfootball_nfl'
    )
    expect(calendarEntriesFor('nwsl-2026')[0].oddsKey).toBeUndefined()
  })
  it('computes status from the dates', () => {
    const entry = { startDate: '2026-09-04', endDate: '2027-01-04' }
    expect(calendarStatus(entry, Date.UTC(2026, 8, 13))).toBe('active')
    expect(calendarStatus(entry, Date.UTC(2026, 7, 1))).toBe('upcoming')
    expect(calendarStatus(entry, Date.UTC(2027, 1, 1))).toBe('completed')
    expect(
      activeCalendarEntries(Date.UTC(2026, 8, 13)).some(
        (e) => e.competitionId === 'nfl-regular-2026'
      )
    ).toBe(true)
  })
})
