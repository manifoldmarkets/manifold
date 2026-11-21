import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ScheduleGame } from 'common/sports-schedule'
import {
  applySportsLive,
  decodeSportsScoreTick,
} from 'common/sports-schedule-live'
import {
  newerMarketScore,
  recoverMarketSnapshot,
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
const recoverMarketScore = (
  current: MarketScoreSnapshot,
  read: MarketScoreSnapshot
) => recoverMarketSnapshot(current, read).game
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
  assert.deepEqual(view.home, base.home)
  assert.deepEqual(view.away, base.away)
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
    newerMarketScore(recovered, saved({ liveUpdatedTime: 200 }, 1000)).game
      ?.liveUpdatedTime,
    300
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
test('a reschedule and kickoff uncertainty follow the contract version independently of the score receipt', () => {
  const shifted = saved(
    {
      startTime: 900,
      closeTime: 1000,
      kickoffKnown: false,
      liveUpdatedTime: 160,
      gameState: 'scheduled',
      liveScore: null,
    },
    400
  )
  const recovered = recoverMarketSnapshot(current, shifted)
  assert.equal(recovered.game?.startTime, 900)
  assert.equal(recovered.game?.closeTime, 1000)
  assert.equal(recovered.game?.kickoffKnown, false)
  assert.equal(recovered.game?.liveUpdatedTime, 220)
  assert.equal(recovered.game?.gameState, 'live')
  const laterScore = saved({ liveUpdatedTime: 320, closeTime: 502 }, 300)
  const merged = newerMarketScore(recovered, laterScore)
  assert.equal(merged.game?.liveUpdatedTime, 320)
  assert.equal(merged.game?.closeTime, 1000)
  assert.equal(newerMarketScore(merged, shifted).game?.liveUpdatedTime, 320)
})

test('later betting activity recovers mapped pools for the price and ticket; stale and unversioned pools cannot overwrite them', () => {
  const sample = (time: number, homeProb: number, pool: number) => {
    const game = {
      ...base,
      home: { ...base.home, prob: homeProb },
      away: { ...base.away, prob: 1 - homeProb },
    }
    const contract = {
      lastBetTime: time,
      answers: [
        { id: 'h', prob: homeProb, poolYes: pool },
        { id: 'a', prob: 1 - homeProb, poolYes: 100 - pool },
      ],
    } as MarketScoreSnapshot['contract']
    return { ...current, game, contract }
  }
  const existing = sample(10, 0.4, 60)
  const recovered = recoverMarketSnapshot(existing, sample(20, 0.7, 30))
  assert.equal(recovered.game?.home.prob, 0.7)
  assert.equal(recovered.contract?.answers[0].poolYes, 30)
  for (const time of [0, 10, 20]) {
    const stale = newerMarketScore(recovered, sample(time, 0.1, 90))
    assert.equal(stale.game?.home.prob, 0.7)
    assert.equal(stale.contract?.answers[0].poolYes, 30)
  }
})

test('a known denial beats equal-version public snapshots; a subsequent public edit can recover', () => {
  const denied = {
    id: base.id,
    updated: 240,
    game: null,
    denied: true,
  } as const
  assert.equal(recoverMarketSnapshot(current, denied).game, null)
  assert.equal(newerMarketScore(denied, current).game, null)
  assert.equal(
    newerMarketScore(denied, { ...current, updated: 241 }).game,
    base
  )
  assert.equal(
    newerMarketScore(denied, { id: base.id, updated: 0, game: null }),
    denied
  )
  const missing = marketScoreSnapshot(base.id, undefined, 900)
  assert.equal(recoverMarketSnapshot(current, missing).game, null)
  assert.equal(newerMarketScore(missing, current).game, base)
  const missingAfterRead = marketScoreSnapshot(
    base.id,
    undefined,
    900,
    current.updated
  )
  assert.equal(recoverMarketSnapshot(current, missingAfterRead).game, null)
  assert.equal(
    recoverMarketSnapshot({ ...current, updated: 241 }, missingAfterRead).game,
    base
  )
})
