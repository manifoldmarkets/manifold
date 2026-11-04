import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MultiContract } from 'common/contract'
import {
  dayAgoProbs,
  parseSeatCount,
  seatDistribution,
  seatOutcome,
} from './senate-seats'

// A cpmm-multi-1 answer at probability `prob`: with p = 0.5 the price is
// poolNo / (poolYes + poolNo).
const answer = (
  id: string,
  text: string,
  prob: number,
  extra: Record<string, unknown> = {}
) => ({
  id,
  text,
  index: 0,
  poolYes: 1 - prob,
  poolNo: prob,
  p: 0.5,
  probChanges: { day: 0, week: 0, month: 0 },
  ...extra,
})

const market = (answers: ReturnType<typeof answer>[]) =>
  ({
    id: 'seats',
    mechanism: 'cpmm-multi-1',
    outcomeType: 'MULTIPLE_CHOICE',
    answers: answers.map((a, index) => ({ ...a, index })),
  } as unknown as MultiContract)

test('only a plain whole number is a seat count', () => {
  assert.equal(parseSeatCount('53'), 53)
  assert.equal(parseSeatCount(' 47 '), 47)
  assert.equal(parseSeatCount('57+'), undefined)
  assert.equal(parseSeatCount('Other'), undefined)
  assert.equal(parseSeatCount('52.5'), undefined)
})

test('counts sort ascending, other answers follow, Other last', () => {
  const dist = seatDistribution(
    market([
      answer('o', 'Other', 0.1, { isOther: true }),
      answer('b', '52', 0.3),
      answer('x', '57 or more', 0.05),
      answer('a', '49', 0.2),
      answer('c', '50', 0.35),
    ])
  )
  assert.deepEqual(
    dist.buckets.map((b) => b.label),
    ['49', '50', '52', '57 or more', 'Other']
  )
  assert.equal(dist.buckets[4].seats, undefined)
})

test('the majority line splits at 51, and 50 is the short side', () => {
  const dist = seatDistribution(
    market([
      answer('a', '49', 0.1),
      answer('b', '50', 0.2),
      answer('c', '51', 0.25),
      answer('d', '53', 0.3),
      answer('o', 'Other', 0.15, { isOther: true }),
    ])
  )
  assert.equal(dist.short?.min, 49)
  assert.equal(dist.short?.max, 50)
  assert.ok(Math.abs((dist.short?.prob ?? 0) - 0.3) < 1e-9)
  assert.equal(dist.majority?.min, 51)
  assert.equal(dist.majority?.max, 53)
  assert.ok(Math.abs((dist.majority?.prob ?? 0) - 0.55) < 1e-9)
})

test('a side with no listed counts is undefined', () => {
  const dist = seatDistribution(
    market([answer('c', '51', 0.6), answer('d', '52', 0.4)])
  )
  assert.equal(dist.short, undefined)
  assert.equal(dist.majority?.min, 51)
})

test('the most likely count never picks Other', () => {
  const dist = seatDistribution(
    market([
      answer('a', '52', 0.2),
      answer('b', '53', 0.3),
      answer('o', 'Other', 0.5, { isOther: true }),
    ])
  )
  assert.equal(dist.mostLikely?.label, '53')
})

test('cancelled answers are dropped', () => {
  const dist = seatDistribution(
    market([
      answer('a', '52', 0.5),
      answer('b', '53', 0.5, { resolution: 'CANCEL' }),
    ])
  )
  assert.deepEqual(
    dist.buckets.map((b) => b.label),
    ['52']
  )
})

test('24 hours ago comes from the snapshot, clamped, skipping missing changes', () => {
  const snapshot = market([
    answer('a', '52', 0.3, { probChanges: { day: 0.1, week: 0, month: 0 } }),
    answer('b', '53', 0.02, { probChanges: { day: 0.05, week: 0, month: 0 } }),
    answer('c', '54', 0.4, { probChanges: undefined }),
  ])
  const dayAgo = dayAgoProbs(snapshot)
  assert.ok(Math.abs(dayAgo.a - 0.2) < 1e-9)
  assert.equal(dayAgo.b, 0)
  assert.equal('c' in dayAgo, false)

  // A live bet moves the price; the baseline stays where the snapshot put it.
  const live = market([
    answer('a', '52', 0.5),
    answer('b', '53', 0.02),
    answer('c', '54', 0.4),
  ])
  const dist = seatDistribution(live, dayAgo)
  assert.ok(Math.abs(dist.buckets[0].prob - 0.5) < 1e-9)
  assert.ok(Math.abs((dist.buckets[0].dayAgoProb ?? 0) - 0.2) < 1e-9)
  assert.equal(dist.buckets[2].dayAgoProb, undefined)
})

test('a resolved market shows its payout, not its last price', () => {
  const answers = [answer('a', '50', 0.3), answer('b', '51', 0.7)]
  const winner = seatDistribution({
    ...market(answers),
    isResolved: true,
    resolution: 'b',
  } as MultiContract)
  assert.deepEqual(
    winner.buckets.map((b) => b.prob),
    [0, 1]
  )
  assert.equal(winner.mostLikely?.label, '51')

  const split = seatDistribution({
    ...market(answers),
    isResolved: true,
    resolution: 'MKT',
    resolutions: { a: 25, b: 75 },
  } as MultiContract)
  assert.deepEqual(
    split.buckets.map((b) => b.prob),
    [0.25, 0.75]
  )

  // N/A pays everyone back: keep the last prices on show.
  const cancelled = seatDistribution({
    ...market(answers),
    isResolved: true,
    resolution: 'CANCEL',
  } as MultiContract)
  assert.ok(Math.abs(cancelled.buckets[1].prob - 0.7) < 1e-9)
})

test('a non-finite price shows as zero', () => {
  const dist = seatDistribution(
    market([answer('a', '52', NaN), answer('b', '53', 1)])
  )
  assert.equal(dist.buckets[0].prob, 0)
})

test('who runs the Senate at each count', () => {
  assert.equal(seatOutcome(51), 'Democratic majority')
  assert.equal(seatOutcome(50), '50–50, Vance breaks ties')
  assert.equal(seatOutcome(49), 'Republican majority')
})
