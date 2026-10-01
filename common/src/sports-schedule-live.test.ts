import { ScheduleGame, SportsScheduleResponse } from './sports-schedule'
import {
  applySportsLive,
  LiveGameState,
  pruneSportsLive,
} from './sports-schedule-live'

const game: ScheduleGame = {
  id: 'game',
  slug: 'game',
  creatorUsername: 'ManifoldSports',
  question: 'Home?',
  sport: 'nfl',
  league: 'NFL',
  binary: true,
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
    prob: 0.4,
  },
  away: {
    answerId: 'NO',
    name: 'Away',
    shortName: 'A',
    flag: '',
    imageUrl: null,
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
  upcoming: [],
  counts: {},
  liveCount: 1,
})
const live: LiveGameState = {
  probs: { YES: { value: 0.65, at: 200 }, NO: { value: 0.35, at: 200 } },
  liveScore: {
    value: { home: 7, away: 0, minute: null, status: 'IN_PLAY' },
    at: 200,
    status: 'IN_PLAY',
  },
}

it('keeps newer ticks when a refetch returns a cached snapshot', () => {
  const state = pruneSportsLive({ game: live }, snapshot(150))
  expect(applySportsLive(game, state.game, 150).home.prob).toBe(0.65)
  expect(state.game.liveScore?.value?.home).toBe(7)
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
