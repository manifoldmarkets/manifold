import {
  backedOff,
  creditsPerDay,
  DEFAULT_FINALS_INTERVAL,
  finalsDue,
  finalsOnlySettings,
  liveInterval,
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
    const twoAgo = { americanfootball_nfl: NOW - 2 * MIN }
    expect(
      scorePollPlan([game('a', 181)], off, twoAgo, NOW, {}, twoAgo)
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
    const tenAgo = { americanfootball_nfl: NOW - 10 * MIN }
    const halfHourAgo = { americanfootball_nfl: NOW - 31 * MIN }
    // With live scores off or on: a closed market isn't polled for live
    // scores, so the 5-minute live default doesn't override the half hour.
    for (const s of [
      settings({ sports: { nfl: 0 }, finals: 60 }),
      settings(),
    ]) {
      expect(scorePollPlan([stuck], s, tenAgo, NOW, {}, tenAgo)).toEqual([])
      expect(
        scorePollPlan([stuck], s, halfHourAgo, NOW, {}, halfHourAgo)
      ).toEqual([{ sportKey: 'americanfootball_nfl', withFinished: true }])
    }
  })

  it('asks for finished games at the finals interval, not on every live poll', () => {
    // A game polled every 30 seconds next to one waiting on its final.
    const s = settings({ sports: { nfl: 30 } })
    const games = [game('live', 30), game('waiting', 181)]
    const polled = { americanfootball_nfl: NOW - 40 * 1000 }
    // Finals checked a minute ago: this live poll costs 1 credit, not 2.
    expect(
      scorePollPlan(
        games,
        s,
        polled,
        NOW,
        {},
        { americanfootball_nfl: NOW - MIN }
      )
    ).toEqual([{ sportKey: 'americanfootball_nfl', withFinished: false }])
    // Five minutes on, the finals check is due again.
    expect(
      scorePollPlan(
        games,
        s,
        polled,
        NOW,
        {},
        { americanfootball_nfl: NOW - 5 * MIN }
      )
    ).toEqual([{ sportKey: 'americanfootball_nfl', withFinished: true }])
  })

  it("doesn't poll a game gone from the feed for live scores", () => {
    // Missing even with finished games asked for: postponed. Only the
    // finals check looks for it.
    const gone = game('a', 60, { missing: true })
    const recent = { americanfootball_nfl: NOW - 40 * 1000 }
    expect(
      scorePollPlan(
        [gone],
        settings({ sports: { nfl: 30 } }),
        recent,
        NOW,
        {},
        recent
      )
    ).toEqual([])
  })
})

describe('scorePollPlan after failed calls', () => {
  it("doesn't let a finals check through a failure cooldown", () => {
    // Six failed 30-second live polls: the next call of any kind waits half
    // an hour from the last attempt, even a finals check that has never run.
    const s = settings({ sports: { nfl: 30 } })
    const atFinals = game('a', 180, { closeTime: NOW + 60 * MIN })
    const lastAttempt = { americanfootball_nfl: NOW - 10 * 1000 }
    const fails = { americanfootball_nfl: 6 }
    expect(scorePollPlan([atFinals], s, lastAttempt, NOW, fails, {})).toEqual(
      []
    )
    // Half an hour after the last attempt, the finals check goes first.
    const halfHourAgo = { americanfootball_nfl: NOW - 30 * MIN }
    expect(scorePollPlan([atFinals], s, halfHourAgo, NOW, fails, {})).toEqual([
      { sportKey: 'americanfootball_nfl', withFinished: true },
    ])
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

  it('averages a short history over the full days it has, not over seven', () => {
    // Two days of use: yesterday's 700 is the rate, not 1,000 over 7.
    expect(
      creditsPerDay(
        [
          { day: day(1), credits: 700 },
          { day: day(0), credits: 300 },
        ],
        NOW
      )
    ).toEqual({ perDay: 700, days: 1, today: 300 })
    expect(
      creditsPerDay(
        [
          { day: day(3), credits: 300 },
          { day: day(1), credits: 600 },
        ],
        NOW
      )
    ).toEqual({ perDay: 300, days: 3, today: 0 })
  })

  it('counts a quiet day in a week of history as a day of nothing', () => {
    // Used 10 days ago, then only today: nothing over the week before today.
    expect(
      creditsPerDay(
        [
          { day: day(10), credits: 900 },
          { day: day(0), credits: 100 },
        ],
        NOW
      )
    ).toEqual({ perDay: 0, days: 7, today: 100 })
  })

  it('never averages today, a partial day', () => {
    // Two hours into the first day of use there is no rate yet.
    expect(creditsPerDay([{ day: day(0), credits: 40 }], NOW)).toEqual({
      perDay: 0,
      days: 0,
      today: 40,
    })
    expect(creditsPerDay([], NOW)).toEqual({ perDay: 0, days: 0, today: 0 })
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

  it('falls back to finals only, with live scores off for every sport', () => {
    const fallback = finalsOnlySettings()
    expect(liveInterval({ contractId: 'a', sport: 'nfl' }, fallback)).toBe(0)
    expect(liveInterval({ contractId: 'a', sport: 'nhl' }, fallback)).toBe(0)
    expect(fallback.finals).toBe(DEFAULT_FINALS_INTERVAL)
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
