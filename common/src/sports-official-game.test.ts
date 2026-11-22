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

it('binds navigation to the original provider and explicit league before projection drops legacy metadata', () => {
  const legacy = {
    sportsProvider: 'odds',
    sportsEventId: 'odds:soccer_epl:match',
    sportsLeagueKey: undefined,
    sportsLeague: 'Soccer',
  }
  expect(project(legacy)).toMatchObject({
    sport: 'soccer',
    navigationLeagueKey: 'epl',
  })
  expect(project({ ...legacy, sportsProvider: 'football-data' })).toMatchObject(
    { navigationLeagueKey: null }
  )
  expect(project({ ...legacy, sportsLeagueKey: 'laliga' })).toMatchObject({
    navigationLeagueKey: null,
  })
  expect(
    project({
      ...legacy,
      sportsProvider: undefined,
      sportsEventId: 'bdl:laliga:24',
    })
  ).toMatchObject({ navigationLeagueKey: 'laliga' })
})
