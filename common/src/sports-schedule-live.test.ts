import {
  ScheduleGame,
  SportsScheduleResponse,
  sportsGameBinding,
} from './sports-schedule'
import {
  applySportsLive,
  decodeSportsScoreTick,
  newerSportsScoreTick,
  LiveGameState,
  pruneSportsLive,
  projectSportsRail,
} from './sports-schedule-live'

const game: ScheduleGame = {
  id: 'game',
  slug: 'game',
  creatorUsername: 'ManifoldSports',
  question: 'Home?',
  sport: 'nfl',
  league: 'NFL',
  sportsEventId: 'odds:nfl:game',
  startTime: 0,
  kickoffKnown: true,
  closeTime: 10_000,
  status: 'live',
  isResolved: false,
  winnerAnswerId: null,
  resolutionTime: null,
  home: {
    answerId: 'YES',
    name: 'Home',
    shortName: 'H',
    flag: '',
    imageUrl: null,
    color: null,
    prob: 0.4,
  },
  away: {
    answerId: 'NO',
    name: 'Away',
    shortName: 'A',
    flag: '',
    imageUrl: null,
    color: null,
    prob: 0.6,
  },
  draw: null,
  volume: 0,
  uniqueBettorCount: 0,
  liveScore: null,
  finalScore: null,
  related: [],
  relatedCount: 0,
  liveUpdatedTime: 100,
}
const snapshot = (snapshotTime: number, g = game): SportsScheduleResponse => ({
  snapshotTime,
  games: [g],
  nextCursor: null,
  upcoming: [],
  counts: {},
  liveCount: 1,
  sports: [],
})
const live: LiveGameState = {
  probs: { YES: { value: 0.65, at: 200 }, NO: { value: 0.35, at: 200 } },
  liveScore: {
    value: { home: 7, away: 0, minute: null, status: 'IN_PLAY' },
    at: 200,
    status: 'IN_PLAY',
  },
}

it('recovers postponed and final-in-review games via full websocket snapshots and clears stale detail', () => {
  const score = {
    sportsHomeScore: 0,
    sportsAwayScore: 0,
    sportsLiveStatus: 'SUSPENDED',
    sportsLiveMinute: null,
    sportsLiveUpdatedTime: 200,
    sportsResumptionTime: 400,
    sportsLiveDetail: { outs: 0, privateData: 'never sent' },
    sportsAttentionReason: 'secret',
  }
  const suspended = decodeSportsScoreTick(score)!
  const interrupted = applySportsLive(game, { liveScore: suspended })
  expect(interrupted).toMatchObject({
    status: 'upcoming',
    gameState: 'suspended',
    resumptionTime: 400,
    scoreboard: { outs: 0 },
    liveScore: { home: 0, away: 0 },
  })
  expect(JSON.stringify(suspended)).not.toContain('secret')
  expect(JSON.stringify(suspended)).not.toContain('privateData')
  const final = decodeSportsScoreTick({
    ...score,
    sportsLiveUpdatedTime: 300,
    sportsLiveStatus: 'FINAL',
    sportsFinalQualifier: 'OT',
  })
  const settling = applySportsLive(interrupted, { liveScore: final })
  expect(settling).toMatchObject({
    status: 'upcoming',
    gameState: 'settling',
    finalQualifier: 'OT',
    finalScore: { home: 0, away: 0 },
  })
  expect(settling.resumptionTime).toBeUndefined()
  const live = decodeSportsScoreTick({
    ...score,
    sportsLiveStatus: 'IN_PROGRESS',
    sportsLiveUpdatedTime: 350,
    sportsLiveDetail: null,
    sportsLivePeriod: 3,
    sportsLiveClock: '0:00',
  })
  const recovered = applySportsLive(settling, { liveScore: live })
  expect(recovered).toMatchObject({
    status: 'live',
    gameState: 'live',
    period: 3,
    clock: '0:00',
    liveScore: { home: 0, away: 0, period: 3, clock: '0:00' },
    finalScore: null,
  })
  expect(recovered.finalQualifier).toBeUndefined()
  expect(recovered.scoreboard).toBeUndefined()
  expect(recovered.resumptionTime).toBeUndefined()
  const scheduled = decodeSportsScoreTick({
    ...score,
    sportsLiveStatus: 'scheduled',
    sportsLiveUpdatedTime: 360,
    sportsLiveDetail: null,
  })
  expect(applySportsLive(recovered, { liveScore: scheduled })).toMatchObject({
    status: 'upcoming',
    gameState: 'scheduled',
    liveScore: null,
  })
  expect(newerSportsScoreTick(live, final)).toBe(live)
  expect(newerSportsScoreTick(live, { ...live!, status: 'SUSPENDED' })).toBe(
    live
  )
  expect(newerSportsScoreTick(final, live)).toBe(live)
  expect(
    decodeSportsScoreTick({ ...score, sportsLiveUpdatedTime: NaN })
  ).toBeUndefined()
})

it('honors all established terminal and live events without guessing a final score', () => {
  const old = {
    sportsHomeScore: 0,
    sportsAwayScore: 0,
    sportsLiveMinute: null,
    sportsLiveUpdatedTime: 300,
  }
  for (const status of ['FINISHED', 'AWARDED']) {
    const updated = applySportsLive(game, {
      liveScore: decodeSportsScoreTick({ ...old, sportsLiveStatus: status }),
    })
    expect(updated.status).toBe('finished')
    expect(updated.finalScore).toBeNull()
    expect(updated.liveScore).toBeNull()
  }
  const paused = applySportsLive(game, {
    liveScore: decodeSportsScoreTick({
      ...old,
      sportsLiveStatus: 'PAUSED',
      sportsLiveMinute: 'HT',
    }),
  })
  expect(paused.liveScore).toEqual({
    home: 0,
    away: 0,
    minute: 'HT',
    status: 'PAUSED',
  })
})

it('keeps newer ticks when a refetch returns a cached snapshot', () => {
  const state = pruneSportsLive({ game: live }, snapshot(150))
  expect(applySportsLive(game, state.game, 150).home.prob).toBe(0.65)
  expect(state.game.liveScore?.value?.home).toBe(7)
})

it('preserves the provider time independently of the receipt time through push updates', () => {
  const updated = applySportsLive(game, {
    liveScore: { ...live.liveScore!, scoreUpdatedTime: 120 },
  })
  expect(updated.liveUpdatedTime).toBe(200)
  expect(updated.scoreUpdatedTime).toBe(120)
  const unknown = applySportsLive({ ...game, scoreUpdatedTime: 90 }, live)
  expect(unknown.scoreUpdatedTime).toBeNull()
})

it('a resolved snapshot wins even over a tick delivered while fetching it', () => {
  const resolved = {
    ...game,
    isResolved: true,
    status: 'finished' as const,
    home: { ...game.home, prob: 1 },
    away: { ...game.away, prob: 0 },
  }
  expect(applySportsLive(resolved, live, 150)).toBe(resolved)
  expect(pruneSportsLive({ game: live }, snapshot(150, resolved))).toEqual({})
})

it('a newer snapshot clears prices but preserves scores absent from a lagging replica', () => {
  const state = pruneSportsLive({ game: live }, snapshot(250))
  expect(state.game.probs).toBeUndefined()
  expect(state.game.liveScore?.at).toBe(200)
  expect(
    pruneSportsLive(state, snapshot(300, { ...game, liveUpdatedTime: 200 }))
  ).toEqual({})
})

it('applies the snapshot during render before the pruning effect runs', () => {
  expect(applySportsLive(game, live, 250).home.prob).toBe(0.4)
})

it('clears the LIVE status immediately on a terminal score push', () => {
  const finished = {
    ...live,
    liveScore: { value: null, at: 300, status: 'FINISHED' },
  }
  expect(applySportsLive(game, finished).status).toBe('finished')
  expect(applySportsLive(game, finished).liveScore).toBeNull()
})

it('does not put an older score push over a newer persisted score', () => {
  const newer = {
    ...game,
    liveUpdatedTime: 300,
    liveScore: { home: 14, away: 7, minute: null, status: 'IN_PLAY' },
  }
  expect(applySportsLive(newer, live).liveScore?.home).toBe(14)
})

it('preserves legacy scores and terminal state when extended score handling is off', () => {
  const row = {
    sportsHomeScore: 2,
    sportsAwayScore: 1,
    sportsLiveStatus: 'IN_PLAY',
    sportsLiveMinute: '63',
    sportsLiveUpdatedTime: 250,
    sportsLivePeriod: '2H',
  }
  // An opted-in writer can attach detail an older browser would ignore.
  const tick = decodeSportsScoreTick(
    { ...row, sportsLivePeriod: 'extra' },
    false
  )!
  expect(
    decodeSportsScoreTick({ ...row, sportsLiveStatus: 'SUSPENDED' }, false)
  ).toBeUndefined()
  expect(tick.value).toEqual({
    home: 2,
    away: 1,
    minute: '63',
    status: 'IN_PLAY',
  })
  expect(tick.fields).toBeUndefined()
  const final = decodeSportsScoreTick(
    { ...row, sportsLiveStatus: 'FINISHED' },
    false
  )!
  expect(newerSportsScoreTick(tick, final, false)).toBe(final)
  const result = applySportsLive(game, { liveScore: final }, 0, false)
  expect(result.status).toBe('finished')
  expect(result.finalScore).toBeNull()
  expect(result.liveScore).toBeNull()
  expect(result).not.toHaveProperty('gameState')
})

it('discards probability and score observations when a contract names a different event or participant', () => {
  const bound = { ...live, binding: sportsGameBinding(game) }
  expect(applySportsLive(game, bound, 150, true, 200).home.prob).toBe(0.65)
  for (const correction of [
    { sportsEventId: 'other-event' },
    { home: { ...game.home, name: 'New home' } },
  ]) {
    const next = { ...game, ...correction, liveUpdatedTime: null }
    expect(applySportsLive(next, bound, 150, true, 200)).toBe(next)
    expect(pruneSportsLive({ game: bound }, snapshot(150, next))).toEqual({})
  }
})

it.each(['FINISHED', 'AWARDED'])(
  'preserves both terminal scores in a BDL %s push',
  (status) => {
    const bdl = { ...game, sportsLeagueKey: 'nba' as const }
    const raw = {
      sportsHomeScore: 2,
      sportsAwayScore: 1,
      sportsLiveMinute: null,
      sportsLiveUpdatedTime: 200,
      sportsLiveStatus: status,
    }
    const tick = decodeSportsScoreTick(raw)
    expect(
      applySportsLive(bdl, { liveScore: tick }, 0, true, 200)
    ).toMatchObject({
      gameState: 'settling',
      observedFinal: true,
      finalScore: { home: 2, away: 1 },
      liveScore: { home: 2, away: 1 },
    })
    const partial = decodeSportsScoreTick({ ...raw, sportsAwayScore: null })
    expect(
      applySportsLive(bdl, { liveScore: partial }, 0, true, 200).finalScore
    ).toBeNull()
    expect(
      applySportsLive(game, { liveScore: tick }, 0, true, 200).finalScore
    ).toBeNull()
  }
)

it('expires off-page observations and replaces only the visible game’s aggregate deadline', () => {
  const now = 700000
  const row = {
    ...game,
    sportsLeagueKey: 'nba' as const,
    gameState: 'live' as const,
    liveUpdatedTime: now,
  }
  const global = {
    ...snapshot(now, row),
    counts: { nfl: 4 },
    liveCount: 4,
    liveExpiries: [
      [now + 1000, 2],
      [now + 600000, 2],
    ] as [number, number][],
  }
  const updated = { ...row, liveUpdatedTime: now + 500 }
  expect(projectSportsRail(global, [row], [updated], now + 500)).toMatchObject({
    liveCount: 4,
    liveExpiries: [
      [now + 1000, 2],
      [now + 600000, 1],
      [now + 600500, 1],
    ],
  })
  expect(projectSportsRail(global, [], [], now + 1000)).toMatchObject({
    liveCount: 2,
    counts: { nfl: 4 },
  })
  expect(
    projectSportsRail(
      global,
      [row],
      [{ ...updated, status: 'finished' }],
      now + 1000
    )
  ).toMatchObject({ liveCount: 1, counts: { nfl: 3 } })
  expect(
    projectSportsRail(
      { ...global, liveExpiries: undefined },
      [],
      [],
      now + 600000
    ).liveCount
  ).toBe(0)
})
