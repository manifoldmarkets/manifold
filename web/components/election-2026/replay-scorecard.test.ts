import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Contract } from 'common/contract'
import { HOUR_MS } from 'common/util/time'
import { POLLS_CLOSE_2026 } from 'web/components/usa-map/election-rewind-model'
import { ComparisonSeries } from './replay-comparisons'
import { REPLAY_MILESTONES, replayPlan, ReplaySnapshot } from './replay-model'
import {
  chamberScores,
  chamberWinner,
  replayStory,
  signedPoints,
} from './replay-scorecard'

// A replay through 9 PM where Manifold has the Republicans at `ours` and the
// other market at `theirs` throughout, for both chambers.
function replay(ours: number, theirs: number) {
  const { times, milestones } = replayPlan(
    REPLAY_MILESTONES,
    POLLS_CLOSE_2026 + 3 * HOUR_MS
  )
  const snapshot: ReplaySnapshot = {
    generatedAt: 0,
    times,
    milestones,
    markets: { s: { prob: [[0, ours]] }, h: { prob: [[0, ours]] } },
  }
  const series: ComparisonSeries[] = [
    {
      source: 'Kalshi',
      retrievedAt: '',
      chambers: {
        senate: times.map((t) => [t, theirs]),
        house: times.map((t) => [t, theirs]),
      },
    },
  ]
  return { snapshot, series }
}

test('scores cover only the milestones up to the polls closing', () => {
  const { snapshot, series } = replay(0.2, 0.26)
  const [senate] = chamberScores(snapshot, series, {
    senate: { id: 's' },
    house: { id: 'h' },
  })
  // 1 week, 1 day, 12h, 6h, 3h, 1h out and polls close; not 9 PM.
  assert.equal(senate.compared, 7)
  assert.equal(senate.ahead, 7)
  assert.equal(senate.averagePoints, 6)
  assert.equal(senate.winner, null)
})

test('a resolved chamber scores on its winner', () => {
  const { snapshot, series } = replay(0.2, 0.26)
  const scores = chamberScores(snapshot, series, {
    senate: { id: 's', winner: 'R' },
    house: { id: 'h', winner: 'D' },
  })
  const senate = scores.find((s) => s.chamber === 'senate')!
  const house = scores.find((s) => s.chamber === 'house')!
  // Manifold put less on the Republicans, who won the Senate here.
  assert.equal(senate.averagePoints, -6)
  assert.equal(senate.ahead, 0)
  assert.equal(house.averagePoints, 6)
  assert.equal(house.ahead, 7)
})

test('no comparison data, no scores', () => {
  const { snapshot } = replay(0.2, 0.26)
  assert.deepEqual(
    chamberScores(snapshot, [], { senate: { id: 's' }, house: { id: 'h' } }),
    []
  )
})

test('the story claims only what the scores show', () => {
  const { snapshot, series } = replay(0.2, 0.26)
  const pending = chamberScores(snapshot, series, {
    senate: { id: 's' },
    house: { id: 'h' },
  })
  assert.deepEqual(replayStory(pending), {
    sawIt: false,
    demsAheadEverywhere: true,
    winners: [],
  })
  const houseWon = chamberScores(snapshot, series, {
    senate: { id: 's' },
    house: { id: 'h', winner: 'D' },
  })
  assert.deepEqual(replayStory(houseWon), {
    sawIt: true,
    demsAheadEverywhere: true,
    winners: ['Democrats won the House.'],
  })
  const split = chamberScores(snapshot, series, {
    senate: { id: 's', winner: 'R' },
    house: { id: 'h', winner: 'D' },
  })
  const story = replayStory(split)
  // A chamber the Republicans won breaks "Democrats ahead everywhere".
  assert.equal(story.demsAheadEverywhere, false)
  assert.equal(story.sawIt, true)
  assert.deepEqual(story.winners, [
    'Democrats won the House.',
    'Republicans won the Senate.',
  ])
  // Manifold behind real money is never a win.
  const behind = replay(0.3, 0.2)
  assert.equal(
    replayStory(
      chamberScores(behind.snapshot, behind.series, {
        senate: { id: 's', winner: 'D' },
        house: { id: 'h', winner: 'D' },
      })
    ).sawIt,
    false
  )
})

test('chamber winners come from resolved control markets', () => {
  const market = (fields: Partial<Contract>) => fields as Contract
  assert.equal(
    chamberWinner(market({ isResolved: true, resolution: 'NO' })),
    'D'
  )
  assert.equal(
    chamberWinner(market({ isResolved: true, resolution: 'YES' })),
    'R'
  )
  assert.equal(chamberWinner(market({ isResolved: false })), undefined)
  assert.equal(
    chamberWinner(market({ isResolved: true, resolution: 'CANCEL' })),
    undefined
  )
  assert.equal(chamberWinner(null), undefined)
})

test('signed points', () => {
  assert.equal(signedPoints(4), '+4 pts')
  assert.equal(signedPoints(-1), '−1 pt')
  assert.equal(signedPoints(0), '0 pts')
})
