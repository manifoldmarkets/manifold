import {
  americanOddsToProb,
  buildOddsMarketParams,
  fairProbs,
  fitProbs,
  gameResolution,
  isThreeWay,
  OddsApiEvent,
  oddsEventId,
  parseOddsEventId,
  teamScores,
  winningSide,
} from './odds-markets'
import { getAnswerProbsError } from './new-contract'
import {
  activeCalendarEntries,
  calendarEntriesFor,
  calendarStatus,
  phaseWindow,
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

describe('2026–27 calendar eligibility', () => {
  it.each([
    ['nfl-regular-2026', '2027-01-11T01:00:00Z'],
    ['nfl-playoffs-2027', '2027-01-19T01:00:00Z'],
    ['nfl-playoffs-2027', '2027-01-25T01:00:00Z'],
    ['nfl-playoffs-2027', '2027-01-31T23:30:00Z'],
    ['nfl-playoffs-2027', '2027-02-14T23:30:00Z'],
    // CFP first round (8pm ET 18 Dec) and the title game (4:30pm PT 25 Jan).
    ['cfb-cfp-2027', '2026-12-19T01:00:00Z'],
    ['cfb-cfp-2027', '2027-01-26T00:30:00Z'],
  ])(
    'includes %s games on their final US calendar day: %s',
    (competition, kickoff) => {
      expect(
        calendarEntriesFor(competition)
          .filter((p) => p.autoCreate)
          .some((p) => {
            const { from, to } = phaseWindow(p)
            return Date.parse(kickoff) >= from && Date.parse(kickoff) <= to
          })
      ).toBe(true)
    }
  )

  it('keeps the college football regular season off until a ranked-matchup filter exists', () => {
    const regular = calendarEntriesFor('cfb-regular-2026').find(
      (p) => p.phase === 'Regular Season'
    )
    expect(regular?.autoCreate).toBe(false)
  })

  it('keeps soccer knockout rounds off until the extra time and penalties rule is decided', () => {
    const playoffs = calendarEntriesFor('mls-2026').find(
      (p) => p.phase === 'MLS Cup Playoffs'
    )
    expect(playoffs?.autoCreate).toBe(false)
  })
})

describe('odds maths', () => {
  it('converts American odds to implied probability', () => {
    expect(americanOddsToProb(-150)).toBeCloseTo(0.6)
    expect(americanOddsToProb(150)).toBeCloseTo(0.4)
    expect(americanOddsToProb(100)).toBeCloseTo(0.5)
  })
  it('devigs each book and averages across them', () => {
    const [home, away] = fairProbs(nflEvent, [
      'Kansas City Chiefs',
      'Buffalo Bills',
    ])!
    // DraftKings -150/+130 and FanDuel -140/+120, each divided by its overround.
    const book = (fav: number, dog: number) => {
      const f = americanOddsToProb(fav)
      return f / (f + americanOddsToProb(dog))
    }
    expect(home).toBeCloseTo((book(-150, 130) + book(-140, 120)) / 2, 10)
    expect(home).toBeGreaterThan(0.55)
    expect(home).toBeLessThan(0.6)
    expect(home + away).toBeCloseTo(1, 10)
  })
  it('returns null without h2h data', () => {
    expect(fairProbs({ ...nflEvent, bookmakers: [] }, ['x', 'y'])).toBeNull()
  })
  it('gives a three-way line that sums to one', () => {
    const probs = fairProbs(soccerEvent, ['Arsenal', 'Chelsea', 'Draw'])!
    expect(probs).toHaveLength(3)
    expect(probs[0] + probs[1] + probs[2]).toBeCloseTo(1, 10)
    expect(probs[0]).toBeGreaterThan(probs[2])
  })
  it('skips books that do not quote every outcome', () => {
    const twoWayBook = {
      ...soccerEvent.bookmakers[0],
      key: 'twoway',
      markets: [
        {
          key: 'h2h' as const,
          last_update: '',
          outcomes: [
            { name: 'Arsenal', price: -1000 },
            { name: 'Chelsea', price: 600 },
          ],
        },
      ],
    }
    const withPartial = {
      ...soccerEvent,
      bookmakers: [...soccerEvent.bookmakers, twoWayBook],
    }
    expect(fairProbs(withPartial, ['Arsenal', 'Chelsea', 'Draw'])).toEqual(
      fairProbs(soccerEvent, ['Arsenal', 'Chelsea', 'Draw'])
    )
    expect(
      fairProbs({ ...soccerEvent, bookmakers: [twoWayBook] }, [
        'Arsenal',
        'Chelsea',
        'Draw',
      ])
    ).toBeNull()
  })
  it('keeps lopsided lines inside the tradeable range and summing to one', () => {
    expect(fitProbs([0.995, 0.005], 0.01, 0.99)).toEqual([0.99, 0.01])
    const three = fitProbs([0.995, 0.003, 0.002], 0.01, 0.99)
    expect(three[0]).toBeCloseTo(0.98, 10)
    expect(three[1]).toBeCloseTo(0.01, 10)
    expect(three[2]).toBeCloseTo(0.01, 10)
    const mixed = fitProbs([0.9, 0.095, 0.005], 0.01, 0.99)
    expect(mixed[2]).toBeCloseTo(0.01, 10)
    expect(mixed[0] + mixed[1] + mixed[2]).toBeCloseTo(1, 10)
    expect(mixed[0] / mixed[1]).toBeCloseTo(0.9 / 0.095, 10)
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
  it('matches scores to teams whatever order they arrive in', () => {
    expect(teamScores(score)).toEqual({ home: 27, away: 24 })
  })
  it('reads the winning side from the payload, not the names', () => {
    expect(winningSide(score)).toBe('home')
    expect(
      winningSide({
        ...score,
        scores: [
          { name: 'Buffalo Bills', score: '30' },
          { name: 'Kansas City Chiefs', score: '27' },
        ],
      })
    ).toBe('away')
    expect(
      winningSide({
        ...score,
        scores: [
          { name: 'Buffalo Bills', score: '20' },
          { name: 'Kansas City Chiefs', score: '20' },
        ],
      })
    ).toBe('tie')
    expect(winningSide({ ...score, completed: false })).toBeNull()
    expect(winningSide({ ...score, scores: null })).toBeNull()
  })
})

describe('the market a game becomes', () => {
  const nfl = calendarEntriesFor('nfl-regular-2026')[0]
  const epl = calendarEntriesFor('epl-2026-27')[0]
  const cfb = calendarEntriesFor('cfb-regular-2026')[0]
  it('is a versus market for the NFL, home first, seeded from the moneyline', () => {
    const p = buildOddsMarketParams(nflEvent, nfl)
    expect(p.outcomeType).toBe('MULTIPLE_CHOICE')
    expect(p.answers).toEqual(['Kansas City Chiefs', 'Buffalo Bills'])
    expect(p.answerShortTexts).toEqual(['KC', 'BUF'])
    const [home, away] = p.answerProbs!
    expect(home).toBeGreaterThan(55)
    expect(home).toBeLessThan(60)
    expect(home + away).toBeCloseTo(100, 1)
    expect(p.question).toBe(
      'Buffalo Bills at Kansas City Chiefs, Sep 13 [official]'
    )
    expect(p.description).toContain('resolves 50/50 between the two teams')
    expect(p.description).toContain('/sports?sport=nfl')
    expect(p.sportsEventId).toBe('odds:americanfootball_nfl:abc123')
    expect(p.sportsStartTimestamp).toBe('2026-09-13T17:00:00Z')
    expect(p.sportsLeague).toBe('NFL')
    expect(p.sportsHomeTeam).toBe('Kansas City Chiefs')
    expect(p.sportsAwayTeam).toBe('Buffalo Bills')
    expect(p.sportsMarketType).toBe('moneyline')
    expect(p.closeTime).toBe(Date.parse('2026-09-13T21:00:00Z'))
  })
  it('seeds opening prices the create validation accepts', () => {
    for (const [event, entry] of [
      [nflEvent, nfl],
      [soccerEvent, epl],
    ] as const) {
      const p = buildOddsMarketParams(event, entry)
      expect(
        getAnswerProbsError({
          answerProbs: p.answerProbs!,
          numAnswers: p.answers.length,
          shouldAnswersSumToOne: true,
          hasOtherAnswer: false,
        })
      ).toBeUndefined()
    }
  })
  it('is three-way for soccer with the Draw last, seeded from the same books', () => {
    expect(isThreeWay(epl)).toBe(true)
    const p = buildOddsMarketParams(soccerEvent, epl)
    expect(p.outcomeType).toBe('MULTIPLE_CHOICE')
    expect(p.answers).toEqual(['Arsenal', 'Chelsea', 'Draw'])
    expect(p.answerProbs).toHaveLength(3)
    expect(p.answerProbs!.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 1)
    expect(p.answerShortTexts).toBeUndefined()
    expect(p.question).toBe('Arsenal vs Chelsea, Sep 13 [official]')
    expect(p.description).toContain('90 minutes plus stoppage time')
    expect(p.sportsLeague).toBe('Soccer')
  })
  it('keeps a lopsided three-way line valid', () => {
    const p = buildOddsMarketParams(
      {
        ...soccerEvent,
        bookmakers: [
          {
            ...soccerEvent.bookmakers[0],
            markets: [
              {
                key: 'h2h',
                last_update: '',
                outcomes: [
                  { name: 'Arsenal', price: -100000 },
                  { name: 'Chelsea', price: 100000 },
                  { name: 'Draw', price: 50000 },
                ],
              },
            ],
          },
        ],
      },
      epl
    )
    expect(p.answerProbs![0]).toBeCloseTo(98, 10)
    expect(
      getAnswerProbsError({
        answerProbs: p.answerProbs!,
        numAnswers: 3,
        shouldAnswersSumToOne: true,
        hasOtherAnswer: false,
      })
    ).toBeUndefined()
  })
  it('links to the sport tab the page knows', () => {
    const p = buildOddsMarketParams(
      { ...nflEvent, sport_key: 'americanfootball_ncaaf' },
      cfb
    )
    expect(p.description).toContain('/sports?sport=ncaaf')
  })
  it('lets a calendar entry override the tie rule', () => {
    expect(isThreeWay({ sport: 'nfl', tiesAllowed: true })).toBe(true)
    expect(isThreeWay({ sport: 'soccer', tiesAllowed: false })).toBe(false)
  })
  it('opens level with no moneyline', () => {
    const p = buildOddsMarketParams({ ...nflEvent, bookmakers: [] }, nfl)
    expect(p.answerProbs).toBeUndefined()
    expect(p.answers).toHaveLength(2)
  })
})

describe('how a finished game resolves', () => {
  const versus = [
    { id: 'home', text: 'Kansas City Chiefs', index: 0 },
    { id: 'away', text: 'Buffalo Bills', index: 1 },
  ]
  const threeWay = [
    { id: 'draw', text: 'Draw', index: 2 },
    { id: 'away', text: 'Chelsea', index: 1 },
    { id: 'home', text: 'Arsenal', index: 0 },
  ]
  it('picks the winning team', () => {
    expect(
      gameResolution(versus, 'home', 'Kansas City Chiefs', 'Buffalo Bills')
    ).toEqual({ outcome: 'home', resolutions: { home: 100 } })
    expect(
      gameResolution(versus, 'away', 'Kansas City Chiefs', 'Buffalo Bills')
    ).toEqual({ outcome: 'away', resolutions: { away: 100 } })
  })
  it('splits a tie 50/50 when there is no Draw answer', () => {
    expect(
      gameResolution(versus, 'tie', 'Kansas City Chiefs', 'Buffalo Bills')
    ).toEqual({
      outcome: 'CHOOSE_MULTIPLE',
      resolutions: { home: 50, away: 50 },
    })
  })
  it('resolves a level three-way game to Draw', () => {
    expect(gameResolution(threeWay, 'tie', 'Arsenal', 'Chelsea')).toEqual({
      outcome: 'draw',
      resolutions: { draw: 100 },
    })
    expect(gameResolution(threeWay, 'away', 'Arsenal', 'Chelsea')).toEqual({
      outcome: 'away',
      resolutions: { away: 100 },
    })
  })
  it('falls back to answer order when the names have been edited', () => {
    const renamed = [
      { id: 'home', text: 'KC', index: 0 },
      { id: 'away', text: 'BUF', index: 1 },
    ]
    expect(
      gameResolution(renamed, 'away', 'Kansas City Chiefs', 'Buffalo Bills')
    ).toEqual({ outcome: 'away', resolutions: { away: 100 } })
    const awayRenamedOnly = [
      { id: 'a', text: 'Buffalo Bills', index: 0 },
      { id: 'b', text: 'Chiefs', index: 1 },
    ]
    expect(
      gameResolution(
        awayRenamedOnly,
        'home',
        'Kansas City Chiefs',
        'Buffalo Bills'
      )
    ).toEqual({ outcome: 'b', resolutions: { b: 100 } })
  })
  it('refuses answers that are not a game', () => {
    expect(
      gameResolution(
        [{ id: 'only', text: 'Kansas City Chiefs', index: 0 }],
        'home'
      )
    ).toBeNull()
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
