import { LIVE_STALE_MS } from './sports-schedule'
import { applySportsLive } from './sports-schedule-live'
import { canBetOnScheduledGame } from './sports-game-feed'
import { gameScoreLabel } from './sports-scoreboard'
import { Answer } from './answer'
import { Contract } from './contract'
import { MANIFOLD_SPORTS_USER_IDS } from './sports'
import { toOfficialGame } from './sports-official-game'

const now = Date.UTC(2026, 10, 21, 15)
const answers = [
  { id: 'away', text: 'Port City', index: 0, prob: 0.4, shortText: 'OLD' },
  { id: 'home', text: 'Lake City', index: 1, prob: 0.6, shortText: 'OLD' },
] as Answer[]
const market = {
  id: 'local-market',
  slug: 'local-game',
  creatorId: MANIFOLD_SPORTS_USER_IDS[0],
  sportsProvider: 'bdl',
  sportsEventId: 'bdl:nba:123',
  sportsLeagueKey: 'nba',
  sportsMarketType: 'moneyline',
  sportsLeague: 'Basketball',
  sportsHomeTeam: 'Lake City',
  sportsAwayTeam: 'Port City',
  sportsHomeTeamId: '17',
  sportsAwayTeamId: '9',
  mechanism: 'cpmm-multi-2',
  outcomeType: 'MULTIPLE_CHOICE',
  sportsStartTimestamp: new Date(now - 60_000).toISOString(),
  closeTime: now + 2 * 60_000,
}
const project = (data: Record<string, unknown>, rows = answers) =>
  toOfficialGame(
    { ...market, ...data } as unknown as Contract,
    rows,
    [],
    undefined,
    now
  )

it('keeps provider entrants, answer IDs and ID-keyed codes through team renames', () => {
  const renamed = answers.map((a) => ({ ...a, text: 'renamed-' + a.id }))
  expect(project({}, renamed)).toMatchObject({
    id: 'local-market',
    sportsEventId: 'bdl:nba:123',
    league: 'NBA',
    sport: 'nba',
    sportsLeagueKey: 'nba',
    home: { answerId: 'home', entrantId: '17', shortName: 'MIL' },
    away: { answerId: 'away', entrantId: '9', shortName: 'DET' },
  })
})

it('keeps unknown kickoffs out of live polling until an observation arrives', () => {
  expect(project({ sportsStartKnown: false })).toMatchObject({
    kickoffKnown: false,
    status: 'upcoming',
    startTime: market.closeTime,
  })
  expect(
    project({
      sportsStartKnown: false,
      sportsLiveStatus: 'in_progress',
      sportsLiveUpdatedTime: now,
      sportsHomeScore: 0,
      sportsAwayScore: 7,
      sportsLivePeriod: 2,
      sportsLiveClock: '0:00',
    })
  ).toMatchObject({
    kickoffKnown: false,
    status: 'live',
    gameState: 'live',
    period: 2,
    clock: '0:00',
    liveScore: { home: 0, away: 7, period: 2, clock: '0:00' },
  })
})

it('distinguishes a provider cancellation from an actual N/A and clears stale scoring', () => {
  const stale = {
    sportsHomeScore: 0,
    sportsAwayScore: 0,
    sportsLivePeriod: 4,
    sportsLiveDetail: { periodScores: [{ home: 0, away: 0 }] },
  }
  const observed = project({ ...stale, sportsLiveStatus: 'canceled' })
  expect(observed).toMatchObject({
    gameState: 'canceled',
    isResolved: false,
    winnerAnswerId: null,
    finalScore: null,
    liveScore: null,
  })
  expect(observed?.isCanceled).toBeUndefined()
  const voided = project(
    { ...stale, sportsLiveStatus: 'FINAL', resolution: 'CANCEL' },
    [{ ...answers[0], resolution: 'YES' }, answers[1]]
  )
  expect(voided).toMatchObject({
    isCanceled: true,
    isResolved: true,
    gameState: 'canceled',
    status: 'finished',
    winnerAnswerId: null,
    liveScore: null,
    finalScore: null,
  })
  expect(voided?.scoreboard).toBeUndefined()
  expect(voided?.period).toBeUndefined()
})

it('shows the actual final score during settlement and only the allowlisted public details', () => {
  const game = project({
    sportsLiveStatus: 'FINAL',
    sportsHomeScore: 0,
    sportsAwayScore: 2,
    sportsLiveDetail: {
      periodScores: [{ home: 0, away: 2, internal: 'PRIVATE' }],
      vendor: 'PRIVATE',
    },
    sportsAttentionReason: 'PRIVATE',
    openingLineVendors: ['PRIVATE'],
    sportsScoreUpdatedTime: now - 10000,
  })
  expect(game).toMatchObject({
    gameState: 'settling',
    isResolved: false,
    finalScore: { home: 0, away: 2 },
    scoreUpdatedTime: now - 10000,
    scoreboard: { periodScores: [{ home: 0, away: 2 }] },
  })
  expect(JSON.stringify(game)).not.toContain('PRIVATE')
})

it.each([
  { sportsEventId: 'bdl-f1:123:456' },
  { sportsProvider: 'odds' },
  { sportsMarketType: 'prop' },
  { sportsFixture: true },
  { sportsLeagueKey: 'nhl' },
  { creatorId: 'ordinary-user' },
  { sportsEventId: 'bdl:atp:123:1-2', sportsLeagueKey: 'atp' },
])('excludes unrelated or unofficial BDL markets %o', (fields) =>
  expect(project(fields)).toBeNull()
)

it('does not publish an old in-progress score as a final score after a BDL resolution', () => {
  const row = project({
    resolution: 'home',
    sportsLiveStatus: 'IN_PROGRESS',
    sportsHomeScore: 0,
    sportsAwayScore: 1,
  })
  expect(row).toMatchObject({
    isResolved: true,
    winnerAnswerId: 'home',
    finalScore: null,
    liveScore: null,
  })
  expect(
    project({
      resolution: 'home',
      sportsLiveStatus: 'FINAL',
      sportsHomeScore: 2,
      sportsAwayScore: 1,
    })
  ).toMatchObject({ winnerAnswerId: 'home', finalScore: { home: 2, away: 1 } })
})

const projectAt = (
  data: Record<string, unknown>,
  time: number,
  rows = answers
) =>
  toOfficialGame(
    { ...market, ...data } as unknown as Contract,
    rows,
    [],
    undefined,
    time
  )!

it('keeps both fixed answer IDs and side prices after opposite renames, and disables an inconsistent native ticket', () => {
  const renamed = answers.map((a, i) => ({ ...a, text: answers[1 - i].text }))
  for (const identity of [{}, { sportsEntrantIds: [9, 17] }]) {
    const game = projectAt(identity, now, renamed)
    expect(game.home).toMatchObject({
      name: 'Lake City',
      entrantId: '17',
      answerId: 'home',
      prob: 0.6,
    })
    expect(game.away).toMatchObject({
      name: 'Port City',
      entrantId: '9',
      answerId: 'away',
      prob: 0.4,
    })
    expect(game.bettingSidesUnverified).toBe(true)
    expect(canBetOnScheduledGame(game, now)).toBe(false)
  }
  expect(canBetOnScheduledGame(projectAt({}, now), now)).toBe(true)
  for (const bad of [[17, 17], [9, 88], [9], [9, 17, null]])
    expect(project({ sportsEntrantIds: bad })).toBeNull()
})
it('uses home/away/draw creation order in three-way soccer and immutable entrant slots when present', () => {
  const soccer = { sportsEventId: 'bdl:epl:77', sportsLeagueKey: 'epl' }
  const sorted = [
    { ...answers[1], index: 0 },
    { ...answers[0], index: 1 },
    { ...answers[0], index: 2, id: 'draw', text: 'Draw' },
  ]
  expect(projectAt(soccer, now, sorted)).toMatchObject({
    home: { answerId: 'home' },
    away: { answerId: 'away' },
    draw: { answerId: 'draw' },
  })
  const inverted = [
    { ...sorted[1], index: 0 },
    { ...sorted[0], index: 1 },
    sorted[2],
  ]
  expect(
    projectAt({ ...soccer, sportsEntrantIds: [9, 17, null] }, now, inverted)
  ).toMatchObject({
    home: { answerId: 'home' },
    away: { answerId: 'away' },
    draw: { answerId: 'draw' },
  })
  expect(
    project({ ...soccer, sportsEntrantIds: [17, 9, 9] }, sorted)
  ).toBeNull()
})
it('requires an observation to report live or final even after kickoff and the contract deadline', () => {
  const start = Date.parse(market.sportsStartTimestamp)
  for (const time of [
    start - 1,
    start,
    start + 100,
    market.closeTime,
    market.closeTime + 1,
  ]) {
    const row = projectAt({}, time)
    expect(row).toMatchObject({
      isResolved: false,
      status: 'upcoming',
      gameState: time < start ? 'scheduled' : 'unavailable',
      liveScore: null,
      finalScore: null,
    })
  }
})
it('ages a silent clock at the receipt boundary and recovers from freshly repeated in-progress reads across four hours', () => {
  const data = {
    sportsLiveStatus: 'in_progress',
    sportsLiveUpdatedTime: now,
    sportsLiveClock: '4:12',
    sportsLivePeriod: 'Q3',
    sportsHomeScore: 10,
    sportsAwayScore: 5,
  }
  const fresh = projectAt(data, now + LIVE_STALE_MS - 1)
  expect(fresh).toMatchObject({
    status: 'live',
    gameState: 'live',
    clock: '4:12',
  })
  for (const at of [now + LIVE_STALE_MS, now + 4 * 60 * 60 * 1000]) {
    const silent = projectAt(data, at)
    expect(silent).toMatchObject({
      isResolved: false,
      status: 'upcoming',
      gameState: 'unavailable',
      observationStale: true,
      liveScore: null,
    })
    expect(silent.clock).toBeUndefined()
    expect(gameScoreLabel(silent)).toMatch(/last seen/)
    expect(applySportsLive(fresh, undefined, 0, true, at)).toMatchObject({
      gameState: 'unavailable',
      observationStale: true,
    })
    const recovered = projectAt({ ...data, sportsLiveUpdatedTime: at }, at)
    expect(recovered).toMatchObject({
      status: 'live',
      gameState: 'live',
      clock: '4:12',
      isResolved: false,
    })
    expect(recovered.observationStale).toBeUndefined()
  }
  expect(
    projectAt({ ...data, sportsLiveUpdatedTime: undefined }, now).gameState
  ).toBe('unavailable')
  expect(
    projectAt({ ...data, resolution: 'home' }, now).observedFinal
  ).toBeUndefined()
  expect(
    projectAt({ ...data, sportsLiveStatus: 'final' }, now).observedFinal
  ).toBe(true)
})
