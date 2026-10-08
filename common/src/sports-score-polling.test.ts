import {
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
