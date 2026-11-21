import { BDL_LEAGUES } from 'common/bdl/leagues'
import type { MajorLeague } from 'common/bdl/major-leagues'
import { DAY_MS, HOUR_MS } from 'common/util/time'
import { majorChange } from './major-change'
import type { MajorGame } from './major-games'
import {
  isMajorMarket,
  majorPayout,
  majorResultHash,
  reviewedResult,
  type MajorMarket,
} from './major-result'

const at = Date.parse('2026-11-07T00:00:00Z')
const iso = (n: number) => new Date(n).toISOString()
const market = (
  league: MajorLeague = 'nba',
  extra: Partial<MajorMarket> = {}
): MajorMarket =>
  ({
    id: 'one',
    creatorId: 'house',
    token: 'MANA',
    visibility: 'public',
    question: 'Away at Home, Nov 6',
    sportsEventId: 'bdl:' + league + ':81',
    sportsProvider: 'bdl',
    sportsLeagueKey: league,
    sportsMarketType: 'moneyline',
    sportsHomeTeam: 'Home',
    sportsAwayTeam: 'Away',
    sportsHomeTeamId: '100',
    sportsAwayTeamId: '200',
    sportsEntrantIds: [200, 100],
    sportsStartTimestamp: iso(at),
    closeTime: at + BDL_LEAGUES[league].closeBufferHours! * HOUR_MS,
    isResolved: false,
    mechanism: 'cpmm-multi-2',
    outcomeType: 'MULTIPLE_CHOICE',
    shouldAnswersSumToOne: true,
    addAnswersMode: 'DISABLED',
    answers: [
      { id: 'away', text: 'Away', index: 0, contractId: 'one' },
      { id: 'home', text: 'Home', index: 1, contractId: 'one' },
    ],
    ...extra,
  } as MajorMarket)
const game = (extra: Partial<MajorGame> = {}): MajorGame => ({
  id: 81,
  home: { id: 100, name: 'Home', code: 'HOM' },
  away: { id: 200, name: 'Away', code: 'AWY' },
  homeScore: 85,
  awayScore: 73,
  slateDate: '2026-11-06',
  startTime: iso(at),
  season: 2026,
  eligible: true,
  postseason: false,
  status: 'final',
  ...extra,
})
function observed(
  league: MajorLeague,
  g: MajorGame,
  m = market(league),
  now = at
) {
  const change = majorChange(m, league, g, now)
  return { change, m: { ...m, ...change.patch } as MajorMarket }
}
it.each([
  'scheduled',
  'in_progress',
  'postponed',
  'delayed',
  'suspended',
  'unknown',
  'abandoned',
] as const)(
  'never settles a %s game even when its displayed scores are unequal',
  (status) => {
    const { change } = observed('nba', game({ status }))
    expect(change.record).toBeUndefined()
    if (status === 'scheduled') expect(change.score?.sportsHomeScore).toBeNull()
    if (status === 'unknown' || status === 'abandoned')
      expect(change.patch.sportsAttentionSince).toBe(at)
  }
)
it.each([null, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
  'holds an invalid final score %s and closes trading',
  (score) => {
    const { change } = observed('mlb', game({ homeScore: score }))
    expect(change).toMatchObject({
      alert: 'invalid final scores',
      patch: { closeTime: at, sportsResultHash: null },
    })
    expect(change.score?.sportsHomeScore).toBeNull()
  }
)
it.each(['nba', 'wnba', 'nhl', 'mlb'] as const)(
  'holds a level %s final even with an overtime or shootout flag',
  (league) => {
    expect(
      observed(
        league,
        game({ homeScore: 2, awayScore: 2, finalQualifier: 'SO' })
      ).change.alert
    ).toBe('unexpected level final')
  }
)
it('pays a confirmed regular NFL tie 50/50 and holds playoff or unknown phase ties', () => {
  const g = game({ homeScore: 13, awayScore: 13, season: 2027 })
  const { m, change } = observed('nfl', g)
  expect(majorPayout(m, change.record!, at)).toEqual({
    outcome: 'CHOOSE_MULTIPLE',
    resolutions: { away: 50, home: 50 },
  })
  for (const postseason of [true, undefined])
    expect(observed('nfl', { ...g, postseason }).change.record).toBeUndefined()
})
it('uses numeric IDs across reversed teams, including standings, shots and quarters; never fabricates score freshness', () => {
  const g = game({
    home: { id: 200, name: 'Away' },
    away: { id: 100, name: 'Home' },
    finalQualifier: 'SO',
    homeScore: 4,
    awayScore: 3,
    detail: {
      shots: { home: 45, away: 30 },
      periodScores: [{ home: 2, away: 1 }],
      standings: { home: { wins: 2, losses: 0 } },
    },
  })
  const { m, change } = observed('nhl', g)
  expect(change.score).toMatchObject({
    sportsHomeScore: 3,
    sportsAwayScore: 4,
    sportsScoreUpdatedTime: null,
    sportsLiveDetail: {
      shots: { away: 45, home: 30 },
      periodScores: [{ away: 2, home: 1 }],
      standings: { away: { wins: 2, losses: 0 } },
    },
    sportsFinalQualifier: 'SO',
  })
  expect(majorPayout(m, change.record!, at)).toEqual({
    outcome: 'away',
    resolutions: { away: 100 },
  })
  expect(
    majorResultHash(
      reviewedResult(
        'nhl',
        game({ homeScore: 3, awayScore: 4, finalQualifier: 'SO' })
      ).record!
    )
  ).toBe(m.sportsResultHash)
})
it('requires both stored entrants, exact event identity and a properly shaped house market', () => {
  const { m, change } = observed('nba', game())
  expect(
    majorChange(m, 'nba', game({ home: { id: 999, name: 'Home' } }), at + 1)
      .alert
  ).toBe('unexpected entrants')
  expect(observed('nba', game({ irregular: true })).change.alert).toBe(
    'irregular result'
  )
  expect(
    majorPayout(m, { ...change.record!, eventId: 'bdl:nba:82' }, at)
  ).toBeUndefined()
  expect(isMajorMarket(m, 'house', 'nba')).toBe(true)
  for (const diff of [
    { creatorId: 'other' },
    { sportsProvider: 'odds' },
    { sportsMarketType: 'total' },
    { visibility: 'private' },
    { deleted: true },
    { sportsFixture: true },
    { token: 'CASH' },
    { mechanism: 'cpmm-multi-1' },
    { shouldAnswersSumToOne: false },
    { addAnswersMode: 'ANYONE' },
    { sportsLeagueKey: 'nhl' },
    { outcomeType: 'BINARY' },
  ]) {
    expect(
      isMajorMarket({ ...m, ...diff } as MajorMarket, 'house', 'nba')
    ).toBe(false)
  }
})
it('revalidates all fixed answers, exact result hash, clock and active status at payment', () => {
  const { m, change } = observed('nba', game())
  const r = change.record!,
    [away, home] = m.answers
  expect(majorPayout(m, r, at)).toEqual({
    outcome: 'home',
    resolutions: { home: 100 },
  })
  for (const diff of [
    { isResolved: true },
    { resolution: 'CANCEL' },
    { sportsAttentionReason: 'manual review' },
    { sportsRecordedResult: undefined },
    { sportsRecordedResult: { ...r, firstScore: 72 } },
    { sportsResultHash: 'old' },
    { sportsFinalSince: 0 },
    { sportsFinalSince: at + 1 },
    { sportsEntrantIds: [100, 200] },
    { sportsEntrantIds: [200] },
    { sportsAwayTeamId: '999' },
    { sportsHomeTeamId: '999' },
    { sportsHomeTeamId: '200' },
    { answers: [away] },
    { answers: [away, home, home] },
    { answers: [away, { ...home, id: 'away' }] },
    { answers: [away, { ...home, index: 2 }] },
    { answers: [{ ...away, isOther: true }, home] },
    { answers: [{ ...away, contractId: 'other' }, home] },
    { answers: [away, { ...home, resolution: 'YES' }] },
    { answers: [{ ...away, resolutionTime: 1 }, home] },
    { sportsEntrantIds: undefined, sportsAwayTeam: 'renamed' },
    { sportsEntrantIds: undefined, sportsHomeTeam: 'renamed' },
  ])
    expect(majorPayout({ ...m, ...diff } as MajorMarket, r, at)).toBeUndefined()
  expect(
    majorPayout({ ...m, sportsEntrantIds: undefined }, r, at)
  ).toBeDefined()
  expect(majorPayout(m, r, NaN)).toBeUndefined()
  const corrupt = { ...r, winnerId: r.secondId }
  expect(
    majorPayout(
      {
        ...m,
        sportsRecordedResult: corrupt,
        sportsResultHash: majorResultHash(corrupt),
      },
      corrupt,
      at
    )
  ).toBeUndefined()
})
it('holds a cancellation for 24 hours of continuous observations, including across restarts', () => {
  const g = game({ status: 'canceled' }),
    a = observed('nba', g)
  expect(a.change).toMatchObject({
    signal: 'canceled',
    patch: { sportsCanceledSince: at, closeTime: at },
  })
  const b = observed('nba', g, a.m, at + DAY_MS - 1)
  expect(majorPayout(b.m, b.change.record!, at + DAY_MS - 1)).toBeUndefined()
  const c = observed('nba', g, b.m, at + DAY_MS)
  expect(majorPayout(c.m, c.change.record!, at + DAY_MS)).toEqual({
    outcome: 'CANCEL',
  })
  const resumed = observed(
    'nba',
    game({ status: 'in_progress' }),
    a.m,
    at + HOUR_MS
  )
  const next = observed('nba', g, resumed.m, at + 2 * HOUR_MS)
  expect(next.m.sportsCanceledSince).toBe(at + 2 * HOUR_MS)
  expect(majorPayout(next.m, next.change.record!, at + DAY_MS)).toBeUndefined()
})
it('holds changed terminal results and conflicting siblings and never changes a paid market', () => {
  const a = observed('nba', game()),
    later = game({ awayScore: 100 })
  const changed = observed('nba', later, a.m, at + 1)
  expect(changed.change.record).toBeUndefined()
  expect(changed.change.alert).toBe('result corrected')
  expect(observed('nba', later, changed.m, at + 2).change.alert).toBeUndefined()
  expect(
    majorChange(a.m, 'nba', game(), at + 1, { conflictingSibling: true }).alert
  ).toBe('conflicting sibling results')
  const paid = { ...a.m, isResolved: true }
  expect(majorChange(paid, 'nba', game(), at + 1).patch).toEqual({
    sportsLastCheckedTime: at + 1,
  })
  const watch = majorChange(paid, 'nba', later, at + 1)
  expect(watch.alert).toBe('result corrected')
  expect(watch.record).toBeUndefined()
  expect(watch.patch.sportsResultHash).toBeUndefined()
})
it('tracks start once, preserves a custom close, never reopens, and resyncs a date-only display with no kickoff funding', () => {
  const buffer = BDL_LEAGUES.nba.closeBufferHours! * HOUR_MS
  const original = market('nba', {
    sportsStartKnown: false,
    sportsKickoffBudget: 0,
    sportsLatestPossibleStartTimestamp: iso(at + DAY_MS),
    closeTime: at + DAY_MS + buffer,
  })
  const real = game({ status: 'scheduled', startTime: iso(at + HOUR_MS) })
  const changed = majorChange(original, 'nba', real, at + 1)
  expect(changed.patch).toMatchObject({
    sportsStartTimestamp: real.startTime,
    sportsStartKnown: true,
    closeTime: at + HOUR_MS + buffer,
  })
  expect({ ...original, ...changed.patch }).toMatchObject({
    sportsKickoffBudget: 0,
  })
  for (const closeTime of [at - 1, at + DAY_MS + buffer - 1]) {
    const decision = majorChange(
      { ...original, closeTime },
      'nba',
      real,
      at + 1
    )
    expect(decision.patch.closeTime).toBeUndefined()
    expect(decision.patch.sportsStartTimestamp).toBe(real.startTime)
  }
  const live = observed('nba', game({ status: 'in_progress' }))
  expect(live.change.signal).toBe('started')
  const replay = majorChange(
    live.m,
    'nba',
    { ...real, status: 'in_progress' },
    at + 1
  )
  expect(replay.signal).toBeUndefined()
  expect(replay.patch.closeTime).toBeUndefined()
})
it('distinguishes adjacent MLB doubleheaders, possible reissues, expired postponements and confirmed suspensions', () => {
  const m = market('mlb', { closeTime: at - HOUR_MS * 4 })
  expect(
    majorChange(m, 'mlb', undefined, at, { replacement: true }).alert
  ).toBe('possible-reid')
  expect(majorChange(m, 'mlb', undefined, at).record).toBeUndefined()
  const old = { ...m, sportsPostponedSince: at - 7 * DAY_MS }
  expect(majorChange(old, 'mlb', game({ status: 'postponed' }), at).alert).toBe(
    'unconfirmed resumption'
  )
  const g = game({ status: 'suspended', resumptionTime: at + DAY_MS })
  const suspended = majorChange(old, 'mlb', g, at)
  expect(suspended.alert).toBeUndefined()
  expect(suspended.suspendedWarning).toBe(true)
  expect(
    majorChange({ ...old, sportsLastWatchWarning: at }, 'mlb', g, at + HOUR_MS)
      .suspendedWarning
  ).toBeUndefined()
  expect(majorChange(m, 'mlb', game({ status: 'in_progress' }), at).alert).toBe(
    'overdue final'
  )
  expect(reviewedResult('mlb', game({ id: 82 })).record!.eventId).not.toBe(
    reviewedResult('mlb', game()).record!.eventId
  )
})
it('holds an ineligible, premature, regular-season cutoff or foreign provider result without paying', () => {
  expect(observed('nba', game({ eligible: false })).change.alert).toBe(
    'irregular result'
  )
  expect(
    observed('nba', game({ startTime: iso(at + DAY_MS) })).change.alert
  ).toBe('irregular result')
  expect(observed('nfl', game({ season: 2026 })).change.alert).toBe(
    'irregular result'
  )
  for (const g of [
    game({ home: { id: 0, name: 'home' } }),
    game({ home: { id: 200, name: 'same' } }),
  ])
    expect(reviewedResult('nba', g)).toEqual({
      incident: 'unexpected entrants',
    })
  const m = market('nba')
  expect(
    isMajorMarket(
      { ...m, sportsMarketType: undefined } as MajorMarket,
      'house',
      'nba'
    )
  ).toBe(false)
  const { sportsEventId: ignored, ...untagged } = m
  expect(ignored).toBeTruthy()
  expect(isMajorMarket(untagged as MajorMarket, 'house', 'nba')).toBe(false)
})
it('refuses malformed durable result contents and legacy bindings independently of digest integrity', () => {
  const { m, change } = observed('nba', game()),
    r = change.record!
  for (const corrupt of [
    { ...r, status: 'invalid' },
    { ...r, firstScore: null },
    { ...r, secondScore: -1 },
    { ...r, firstId: r.secondId },
    { ...r, winnerId: null, firstScore: 50, secondScore: 50 },
  ]) {
    const record = corrupt as typeof r
    expect(
      majorPayout(
        {
          ...m,
          sportsRecordedResult: record,
          sportsResultHash: majorResultHash(record),
        },
        record,
        at
      )
    ).toBeUndefined()
  }
  const [away, home] = m.answers
  for (const answers of [
    undefined,
    [{ ...away, id: '' }, home],
    [away, { ...home, id: '' }],
    [{ ...away, index: 1 }, home],
  ]) {
    expect(majorPayout({ ...m, answers } as MajorMarket, r, at)).toBeUndefined()
  }
  for (const diff of [
    { sportsAwayTeamId: undefined },
    { sportsHomeTeamId: undefined },
    { sportsAwayTeamId: 'other' },
    { sportsHomeTeamId: 'other' },
    {
      sportsEntrantIds: undefined,
      sportsAwayTeam: 'A',
      sportsHomeTeam: 'A',
      answers: [
        { ...away, text: 'A' },
        { ...home, text: 'A' },
      ],
    },
  ])
    expect(majorPayout({ ...m, ...diff } as MajorMarket, r, at)).toBeUndefined()
})
it('validates each independent result identity, score, hold, and answer binding at payout', () => {
  const { m, change } = observed('nba', game()),
    r = change.record!
  expect(reviewedResult('nba', game({ awayScore: null })).incident).toBe(
    'invalid final scores'
  )
  for (const diff of [
    { sportsEventId: 'bdl:nba:82' },
    { sportsFinalSince: undefined },
    { sportsEntrantIds: [200, 100, 88] },
    { sportsEntrantIds: [99, 100] },
    { sportsEntrantIds: [200, 99] },
  ])
    expect(majorPayout({ ...m, ...diff }, r, at)).toBeUndefined()
  for (const corrupt of [
    { ...r, firstId: r.secondId, winnerId: r.secondId },
    { ...r, firstScore: null, winnerId: r.secondId },
  ]) {
    expect(
      majorPayout(
        {
          ...m,
          sportsRecordedResult: corrupt,
          sportsResultHash: majorResultHash(corrupt),
        },
        corrupt,
        at
      )
    ).toBeUndefined()
  }
  const canceled = observed('nba', game({ status: 'canceled' }))
  expect(
    observed('nba', game({ status: 'scheduled' }), canceled.m, at + DAY_MS).m
      .sportsCanceledSince
  ).toBeNull()
  const elapsed = {
    ...market(),
    sportsStartKnown: false,
    sportsLatestPossibleStartTimestamp: iso(at + DAY_MS),
    closeTime: at + DAY_MS + BDL_LEAGUES.nba.closeBufferHours! * HOUR_MS,
  }
  const visited = elapsed.closeTime + HOUR_MS
  expect(
    majorChange(
      elapsed,
      'nba',
      game({ status: 'scheduled', startTime: iso(visited + DAY_MS) }),
      visited
    ).patch.closeTime
  ).toBeUndefined()
})
it('retains validated standings by original team IDs on fast ticks; a missing sync clears them', () => {
  const original = market()
  const first = majorChange(
    original,
    'nba',
    game({
      status: 'in_progress',
      detail: { standings: { home: { wins: 4, losses: 2 } } },
    }),
    at,
    { sync: true }
  )
  const prior = { ...original, ...first.patch } as MajorMarket
  const reversed = game({
    status: 'in_progress',
    home: { id: 200, name: 'Away' },
    away: { id: 100, name: 'Home' },
  })
  expect(
    majorChange(prior, 'nba', reversed, at + 1).score?.sportsLiveDetail
      ?.standings
  ).toEqual({ home: { wins: 4, losses: 2 } })
  expect(
    majorChange(
      { ...prior, sportsStandingsTeamIds: ['200', '100'] },
      'nba',
      reversed,
      at + 1
    ).score?.sportsLiveDetail?.standings
  ).toBeUndefined()
  expect(
    majorChange(prior, 'nba', reversed, at + 1, { sync: true }).score
      ?.sportsLiveDetail?.standings
  ).toBeUndefined()
})
