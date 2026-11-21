import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ScheduleGame } from 'common/sports-schedule'
import {
  applySportsLive,
  decodeSportsScoreTick,
} from 'common/sports-schedule-live'
import {
  newerMarketScore,
  recoverMarketScore,
  marketScoreSnapshot,
  type MarketScoreSnapshot,
} from './market-score-recovery'

const home = {
  answerId: 'h',
  name: 'Home',
  shortName: 'H',
  flag: '',
  imageUrl: null,
  color: null,
  prob: 0.32,
}
const base: ScheduleGame = {
  id: 'market',
  sportsEventId: 'bdl:nba:17',
  sportsLeagueKey: 'nba',
  sport: 'nba',
  league: 'NBA',
  slug: 'market',
  creatorUsername: 'Sports',
  question: 'Current title',
  home,
  away: { ...home, answerId: 'a', name: 'Away', shortName: 'A', prob: 0.68 },
  draw: null,
  startTime: 200,
  closeTime: 800,
  kickoffKnown: true,
  status: 'live',
  gameState: 'live',
  isResolved: false,
  winnerAnswerId: null,
  resolutionTime: null,
  volume: 650,
  uniqueBettorCount: 7,
  related: [],
  relatedCount: 0,
  liveScore: { home: 0, away: 1, minute: null, status: 'IN_PROGRESS' },
  liveUpdatedTime: 220,
  scoreUpdatedTime: 200,
  finalScore: null,
}
const current: MarketScoreSnapshot = { id: base.id, updated: 240, game: base }
const saved = (
  patch: Partial<ScheduleGame>,
  updated = 240
): MarketScoreSnapshot => ({
  id: base.id,
  updated,
  game: { ...base, ...patch },
})
test('recovers a final missed while disconnected but keeps current live answer prices and other market fields', () => {
  const recovered = saved({
    gameState: 'settling',
    status: 'upcoming',
    finalScore: { home: 99, away: 98 },
    liveUpdatedTime: 300,
    scoreUpdatedTime: 195,
    slug: 'stale',
    question: 'stale',
    closeTime: 600,
    volume: 55,
    home: { ...base.home, prob: 0.9 },
    away: { ...base.away, prob: 0.1 },
  })
  const view = recoverMarketScore(current, recovered)!
  assert.equal(view.gameState, 'settling')
  assert.deepEqual(view.finalScore, { home: 99, away: 98 })
  assert.equal(view.scoreUpdatedTime, 195)
  assert.equal(view.liveUpdatedTime, 300)
  assert.equal(view.home, base.home)
  assert.equal(view.away, base.away)
  assert.equal(view.question, base.question)
  assert.equal(view.closeTime, base.closeTime)
  assert.equal(view.volume, base.volume)
  const tick = (receipt: number) =>
    decodeSportsScoreTick({
      sportsHomeScore: 101,
      sportsAwayScore: 101,
      sportsLiveStatus: 'IN_PROGRESS',
      sportsLiveMinute: null,
      sportsLiveUpdatedTime: receipt,
      sportsScoreUpdatedTime: 290,
    })
  assert.equal(
    applySportsLive(view, { liveScore: tick(299) }).gameState,
    'settling'
  )
  assert.equal(
    applySportsLive(view, { liveScore: tick(301) }).gameState,
    'live'
  )
  assert.equal(
    newerMarketScore(recovered, saved({ liveUpdatedTime: 200 }, 1000)),
    recovered
  )
  assert.equal(
    recoverMarketScore(
      current,
      saved({ liveUpdatedTime: 220, scoreUpdatedTime: 218 })
    ),
    base
  )
})
test('uses actual resolution including N/A, and rejects older corrections, unrelated events, and unavailable markets', () => {
  const cancel = saved(
    {
      gameState: 'canceled',
      status: 'finished',
      isResolved: true,
      isCanceled: true,
      resolutionTime: 330,
      winnerAnswerId: null,
      liveScore: null,
      finalScore: null,
    },
    330
  )
  const view = recoverMarketScore(current, cancel)!
  assert.equal(view.isCanceled, true)
  assert.equal(view.isResolved, true)
  assert.equal(view.winnerAnswerId, null)
  const pending = saved({
    gameState: 'canceled',
    isResolved: false,
    liveUpdatedTime: 333,
  })
  assert.equal(recoverMarketScore(current, pending)?.isCanceled, undefined)
  assert.equal(recoverMarketScore(cancel, pending), cancel.game)
  const corrected = saved(
    {
      isResolved: true,
      resolutionTime: 400,
      winnerAnswerId: 'h',
      gameState: 'final',
    },
    400
  )
  assert.equal(recoverMarketScore(cancel, corrected)?.isCanceled, undefined)
  assert.equal(recoverMarketScore(current, { ...cancel, id: 'other' }), base)
  assert.equal(
    recoverMarketScore(
      current,
      saved({ sportsEventId: 'bdl:nba:42', liveUpdatedTime: 400 })
    ),
    base
  )
  assert.equal(
    recoverMarketScore(current, marketScoreSnapshot('market', undefined, 500)),
    null
  )
  assert.equal(recoverMarketScore({ ...current, game: null }, corrected), null)
})
