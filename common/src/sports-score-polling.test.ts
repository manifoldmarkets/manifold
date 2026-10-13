import {
  backedOff,
  creditsPerDay,
  DEFAULT_FINALS_INTERVAL,
  finalsDue,
  parsePollingRows,
  PollingGame,
  pollingSettingError,
  pollingTarget,
  ScorePollingSettings,
  scorePollPlan,
  sportForLeague,
} from './sports-score-polling'

const NOW = Date.parse('2026-10-11T20:00:00Z')
const MIN = 60 * 1000

const game = (
  contractId: string,
  startedAgoMin: number,
  extra: Partial<PollingGame> = {}
): PollingGame => ({
  contractId,
  sportKey: 'americanfootball_nfl',
  sport: 'nfl',
  startTime: NOW - startedAgoMin * MIN,
  closeTime: NOW - startedAgoMin * MIN + 4 * 60 * MIN,
  ...extra,
})

const settings = (
  s: Partial<ScorePollingSettings> = {}
): ScorePollingSettings => ({
  sports: {},
  games: {},
  finals: DEFAULT_FINALS_INTERVAL,
  ...s,
})

const keys = (plan: { sportKey: string }[]) => plan.map((p) => p.sportKey)

describe('scorePollPlan', () => {
  it('polls a sport with a game on every 5 minutes by default', () => {
    const games = [game('a', 30)]
    expect(scorePollPlan(games, settings(), {}, NOW)).toEqual([
      { sportKey: 'americanfootball_nfl', withFinished: false },
    ])
    const polled = { americanfootball_nfl: NOW - 2 * MIN }
    expect(scorePollPlan(games, settings(), polled, NOW)).toEqual([])
    // A tick a moment early still counts.
    const due = { americanfootball_nfl: NOW - 5 * MIN + 3000 }
    expect(keys(scorePollPlan(games, settings(), due, NOW))).toEqual([
      'americanfootball_nfl',
    ])
  })

  it('skips a sport with live scores off until its game is due to end', () => {
    const off = settings({ sports: { nfl: 0 } })
    expect(scorePollPlan([game('a', 60)], off, {}, NOW)).toEqual([])
    // NFL games are due to end 3 hours after kickoff.
    expect(scorePollPlan([game('a', 181)], off, {}, NOW)).toEqual([
      { sportKey: 'americanfootball_nfl', withFinished: true },
    ])
    expect(
      scorePollPlan(
        [game('a', 181)],
        off,
        { americanfootball_nfl: NOW - 2 * MIN },
        NOW
      )
    ).toEqual([])
  })

  it("speeds up a league for one game's override", () => {
    const boosted = settings({ games: { big: 30 } })
    const polled = { americanfootball_nfl: NOW - 40 * 1000 }
    expect(
      keys(
        scorePollPlan([game('big', 30), game('a', 30)], boosted, polled, NOW)
      )
    ).toEqual(['americanfootball_nfl'])
    // Without the big game on, the league is back to 5 minutes.
    expect(scorePollPlan([game('a', 30)], boosted, polled, NOW)).toEqual([])
  })

  it('treats each sport key on its own', () => {
    const games = [
      game('a', 30),
      game('b', 30, { sportKey: 'soccer_epl', sport: 'soccer' }),
    ]
    const polled = { americanfootball_nfl: NOW - MIN }
    expect(keys(scorePollPlan(games, settings(), polled, NOW))).toEqual([
      'soccer_epl',
    ])
  })

  it('checks for a final as soon as a started game drops out of the live scores', () => {
    // An hour into an NFL game, polled 2 minutes ago: not due for 3 more.
    const polled = { americanfootball_nfl: NOW - 2 * MIN }
    expect(scorePollPlan([game('a', 60)], settings(), polled, NOW)).toEqual([])
    // A game the live-only call has stopped listing has probably finished,
    // so it's checked for a final at the finals interval, finished games
    // included, with live scores on or off.
    const gone = game('a', 60, { missing: true })
    for (const s of [
      settings({ finals: 60 }),
      settings({ sports: { nfl: 0 }, finals: 60 }),
    ]) {
      expect(scorePollPlan([gone], s, polled, NOW)).toEqual([
        { sportKey: 'americanfootball_nfl', withFinished: true },
      ])
    }
  })

  it('waits twice as long per failed call in a row, up to half an hour', () => {
    const games = [game('a', 30)]
    const after = (minutes: number) => ({
      americanfootball_nfl: NOW - minutes * MIN,
    })
    expect(keys(scorePollPlan(games, settings(), after(6), NOW))).toEqual([
      'americanfootball_nfl',
    ])
    // One failure: the 5-minute default becomes 10.
    const once = { americanfootball_nfl: 1 }
    expect(scorePollPlan(games, settings(), after(6), NOW, once)).toEqual([])
    expect(
      keys(scorePollPlan(games, settings(), after(10), NOW, once))
    ).toEqual(['americanfootball_nfl'])
    // Many failures: half an hour at most.
    const many = { americanfootball_nfl: 10 }
    expect(scorePollPlan(games, settings(), after(29), NOW, many)).toEqual([])
    expect(
      keys(scorePollPlan(games, settings(), after(30), NOW, many))
    ).toEqual(['americanfootball_nfl'])
  })

  it('checks a game 3 hours past close at most every half hour', () => {
    const stuck = game('a', 8 * 60, { closeTime: NOW - 4 * 60 * MIN })
    const off = settings({ sports: { nfl: 0 }, finals: 60 })
    expect(
      scorePollPlan([stuck], off, { americanfootball_nfl: NOW - 10 * MIN }, NOW)
    ).toEqual([])
    expect(
      keys(
        scorePollPlan(
          [stuck],
          off,
          { americanfootball_nfl: NOW - 31 * MIN },
          NOW
        )
      )
    ).toEqual(['americanfootball_nfl'])
  })
})

describe('backedOff', () => {
  it('doubles per failure up to half an hour, or the interval if longer', () => {
    expect(backedOff(30, 0)).toBe(30)
    expect(backedOff(30, 3)).toBe(240)
    expect(backedOff(300, 5)).toBe(1800)
    expect(backedOff(1800, 2)).toBe(1800)
  })
})

describe('creditsPerDay', () => {
  const day = (daysAgo: number) =>
    new Date(NOW - daysAgo * 24 * 60 * MIN).toISOString().slice(0, 10)

  it('averages a short history over the days it has, not over seven', () => {
    // Two days of use: 1,000 credits is 500 a day, not 143.
    expect(
      creditsPerDay(
        [
          { day: day(1), credits: 700 },
          { day: day(0), credits: 300 },
        ],
        NOW
      )
    ).toEqual({ perDay: 500, days: 2 })
  })

  it('counts a quiet day in a week of history as a day of nothing', () => {
    // Used 10 days ago, then only today: 100 over the week.
    expect(
      creditsPerDay(
        [
          { day: day(10), credits: 900 },
          { day: day(0), credits: 100 },
        ],
        NOW
      )
    ).toEqual({ perDay: 100 / 7, days: 7 })
  })

  it('is nothing with no history, or none this week', () => {
    expect(creditsPerDay([], NOW)).toEqual({ perDay: 0, days: 0 })
    expect(creditsPerDay([{ day: day(10), credits: 900 }], NOW)).toEqual({
      perDay: 0,
      days: 7,
    })
  })
})

describe('finalsDue', () => {
  it('starts when each sport is due to end', () => {
    expect(
      finalsDue({ sport: 'soccer', startTime: NOW - 104 * MIN }, NOW)
    ).toBe(false)
    expect(
      finalsDue({ sport: 'soccer', startTime: NOW - 105 * MIN }, NOW)
    ).toBe(true)
    expect(finalsDue({ sport: 'mlb', startTime: NOW - 120 * MIN }, NOW)).toBe(
      false
    )
  })
})

describe('settings', () => {
  it('accepts the offered speeds only', () => {
    expect(pollingSettingError(pollingTarget.sport('nhl'), 30)).toBeUndefined()
    expect(pollingSettingError(pollingTarget.sport('nhl'), 0)).toBeUndefined()
    expect(pollingSettingError(pollingTarget.sport('nhl'), 15)).toContain(
      'Live scores run every'
    )
    expect(pollingSettingError('sport:curling', 30)).toContain('Unknown sport')
    expect(pollingSettingError(pollingTarget.game('abc123'), null)).toBe(
      undefined
    )
    expect(pollingSettingError('game:../x', 30)).toContain('Bad market id')
    expect(pollingSettingError(pollingTarget.finals, 600)).toBeUndefined()
    expect(pollingSettingError(pollingTarget.finals, 0)).toContain(
      'Finals checks'
    )
    expect(pollingSettingError('everything', 30)).toContain('Unknown setting')
  })

  it('reads rows into settings, skipping bad ones', () => {
    expect(
      parsePollingRows([
        { target: 'sport:nba', intervalSeconds: 30 },
        { target: 'game:abc', intervalSeconds: 0 },
        { target: 'finals', intervalSeconds: 60 },
        { target: 'sport:nba', intervalSeconds: 7 },
      ])
    ).toEqual({ sports: { nba: 30 }, games: { abc: 0 }, finals: 60 })
  })

  it("maps a market's league label to its sport", () => {
    expect(sportForLeague('Soccer')).toBe('soccer')
    expect(sportForLeague('NCAAB')).toBe('cbb')
    expect(sportForLeague(undefined)).toBeUndefined()
  })
})

describe('on dev', () => {
  it('creates nothing and keeps live scores off unless switched on', () => {
    const prev = process.env.NEXT_PUBLIC_FIREBASE_ENV
    process.env.NEXT_PUBLIC_FIREBASE_ENV = 'DEV'
    try {
      jest.isolateModules(() => {
        /* eslint-disable @typescript-eslint/no-require-imports */
        const calendar =
          require('./sports-calendar') as typeof import('./sports-calendar')
        const polling =
          require('./sports-score-polling') as typeof import('./sports-score-polling')
        /* eslint-enable @typescript-eslint/no-require-imports */
        const [epl] = calendar.calendarEntriesFor('epl-2026-27')
        expect(calendar.autoCreates(epl, {})).toBe(false)
        expect(
          calendar.autoCreates(epl, { [calendar.calendarPhaseKey(epl)]: true })
        ).toBe(true)
        expect(polling.DEFAULT_LIVE_INTERVAL).toBe(0)
      })
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_FIREBASE_ENV
      else process.env.NEXT_PUBLIC_FIREBASE_ENV = prev
    }
  })
})
