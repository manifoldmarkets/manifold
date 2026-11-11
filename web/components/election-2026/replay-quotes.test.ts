import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HOUR_MS, MINUTE_MS } from 'common/util/time'
import {
  comparisonsAt,
  ComparisonSeries,
  marketStatus,
  resolvedBy,
} from './replay-comparisons'
import { quotesAtFrames, usableMid } from './replay-quotes'

test('a working book reads its midpoint', () => {
  assert.equal(usableMid(0.25, 0.26), 0.255)
  // One-sided at the floor: offers at 0.1¢, nobody bidding.
  assert.equal(usableMid(0, 0.001), 0.0005)
  assert.equal(usableMid(0.3, 0.3), 0.3)
})

test('an empty, crossed, wide or broken book has no price', () => {
  // A closed market's empty book: $0 bid, $1 ask.
  assert.equal(usableMid(0, 1), undefined)
  assert.equal(usableMid(0.2, 0.31), undefined)
  assert.equal(usableMid(0.3, 0.2), undefined)
  assert.equal(usableMid(-0.1, 0.05), undefined)
  assert.equal(usableMid(0.95, 1.05), undefined)
  assert.equal(usableMid(NaN, 0.2), undefined)
  assert.equal(usableMid(undefined, 0.2), undefined)
})

const T = 1_793_740_000_000

test('frames take the last quote while it is fresh', () => {
  const quotes = [
    { at: T, prob: 0.26 },
    { at: T + 2 * MINUTE_MS, prob: 0.27 },
  ]
  const times = [
    T - MINUTE_MS,
    T,
    T + MINUTE_MS,
    T + 3 * MINUTE_MS,
    T + 7 * HOUR_MS,
  ]
  assert.deepEqual(quotesAtFrames(times, quotes, 6 * HOUR_MS), [
    [T, 0.26],
    [T + MINUTE_MS, 0.26],
    [T + 3 * MINUTE_MS, 0.27],
  ])
})

test('from the close, the last price before it holds', () => {
  const closedAt = T + 10 * MINUTE_MS
  const quotes = [
    { at: T, prob: 0.0005 },
    // After the close: never used, whatever it reads.
    { at: closedAt + MINUTE_MS, prob: 0.5 },
  ]
  const times = [T, closedAt, closedAt + 8 * HOUR_MS]
  assert.deepEqual(quotesAtFrames(times, quotes, 6 * HOUR_MS, closedAt), [
    [T, 0.0005],
    [closedAt, 0.0005],
    [closedAt + 8 * HOUR_MS, 0.0005],
  ])
})

test('the page marks frames from the close as closed', () => {
  const series: ComparisonSeries[] = [
    {
      source: 'Kalshi',
      retrievedAt: '',
      chambers: {
        senate: [
          [T, 0.2],
          [T + HOUR_MS, 0.0005],
        ],
      },
      closedAt: { senate: T + HOUR_MS },
      resolvedAt: { senate: T + 2 * HOUR_MS },
    },
  ]
  assert.deepEqual(comparisonsAt(series, 'senate', T), [
    { source: 'Kalshi', republicanProb: 0.2, closed: false, resolved: false },
  ])
  assert.deepEqual(comparisonsAt(series, 'senate', T + HOUR_MS), [
    { source: 'Kalshi', republicanProb: 0.0005, closed: true, resolved: false },
  ])
  assert.deepEqual(comparisonsAt(series, 'house', T), [])
})

test('a market reads closed from its close and resolved from its resolution', () => {
  assert.equal(marketStatus({ closed: false, resolved: false }), undefined)
  assert.equal(marketStatus({ closed: true, resolved: false }), 'Closed')
  assert.equal(marketStatus({ closed: true, resolved: true }), 'Resolved')
  assert.equal(resolvedBy(undefined, T), false)
  assert.equal(resolvedBy(T, T - 1), false)
  assert.equal(resolvedBy(T, T), true)
  assert.equal(resolvedBy(NaN, T), false)
})

test('past the series, a closed market holds its last price; an open one has none', () => {
  const series: ComparisonSeries[] = [
    {
      source: 'Kalshi',
      retrievedAt: '',
      chambers: {
        senate: [
          [T, 0.2],
          [T + HOUR_MS, 0.0005],
        ],
        house: [[T, 0.07]],
      },
      closedAt: { senate: T + HOUR_MS },
      resolvedAt: { senate: T + 2 * HOUR_MS },
    },
  ]
  // The page's Latest, a day on: the Senate market had closed and resolved.
  assert.deepEqual(comparisonsAt(series, 'senate', T + 24 * HOUR_MS), [
    { source: 'Kalshi', republicanProb: 0.0005, closed: true, resolved: true },
  ])
  // The House market never closed in this data: no stale price carried.
  assert.deepEqual(comparisonsAt(series, 'house', T + 24 * HOUR_MS), [])
  // Between frames of the series is still no price.
  assert.deepEqual(comparisonsAt(series, 'senate', T + MINUTE_MS), [])
})
