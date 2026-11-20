import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  analyzeSwing,
  downsample,
  isCompetitiveSwing,
  rankSwings,
  SPARKLINE_POINTS,
  SwingTimeline,
  toSwing,
  twoPartyDem,
} from './swings-2026'

const HOUR = 3_600_000
// 100 frames an hour apart; frame 60 stands in for the first poll closings.
const TIMES = Array.from({ length: 100 }, (_, i) => 1_000 * HOUR + i * HOUR)
const POLLS = 60

// A straight move from `from` to `to` over the window.
const ramp = (from: number, to: number) =>
  TIMES.map((_, i) => from + ((to - from) * i) / (TIMES.length - 1))

const timeline = (
  label: string,
  values: (number | undefined)[],
  extra: Partial<SwingTimeline> = {}
): SwingTimeline => ({
  contractId: `id-${label}`,
  slug: `slug-${label}`,
  creatorUsername: 'someone',
  label,
  office: 'senate',
  state: 'IA',
  values,
  ...extra,
})

test('two-party share ignores an Other answer', () => {
  const near = (actual: number | undefined, expected: number) =>
    assert.ok(
      actual !== undefined && Math.abs(actual - expected) < 1e-9,
      `${actual} ≈ ${expected}`
    )
  near(twoPartyDem({ dem: 0.4, rep: 0.4, other: 0.2 }), 0.5)
  near(twoPartyDem({ dem: 0.6, rep: 0.2, other: 0.2 }), 0.75)
  // The majors hold less than half the odds: not a D-vs-R contest.
  assert.equal(twoPartyDem({ dem: 0.1, rep: 0.3, other: 0.6 }), undefined)
  // A "not Democratic" complement isn't the Republicans either.
  assert.equal(
    twoPartyDem({ dem: 0.3, rep: 0.1, other: 0, notDem: 0.6 }),
    undefined
  )
  assert.equal(twoPartyDem(undefined), undefined)
  assert.equal(twoPartyDem({ dem: 0, rep: 0, other: 1 }), undefined)
})

test('a resolved race describes the winner', () => {
  const won = toSwing(
    timeline('Upset', ramp(0.3, 0.6), { result: { value: 1, time: 5 } }),
    TIMES,
    POLLS
  )!
  assert.equal(won.side, 'D')
  assert.equal(won.sideLabel, 'Democrats')
  assert.equal(won.from, 0.3)
  assert.equal(won.to, 1)
  assert.equal(won.resolved, true)

  // The Democrats gained all week but lost: the numbers are the Republicans'.
  const lost = toSwing(
    timeline('Comeback', ramp(0.3, 0.45), { result: { value: 0 } }),
    TIMES,
    POLLS
  )!
  assert.equal(lost.side, 'R')
  assert.equal(lost.sideLabel, 'Republicans')
  assert.equal(lost.from, 0.7)
  assert.equal(lost.to, 1)
  assert.equal(
    lost.pollsClose,
    Math.round((1 - ramp(0.3, 0.45)[POLLS]) * 1e4) / 1e4
  )
})

test('an unresolved race describes the side that gained', () => {
  const up = toSwing(timeline('Up', ramp(0.4, 0.7)), TIMES, POLLS)!
  assert.equal(up.side, 'D')
  assert.equal(up.from, 0.4)
  assert.equal(up.to, 0.7)
  assert.equal(up.resolved, false)

  const down = toSwing(timeline('Down', ramp(0.6, 0.2)), TIMES, POLLS)!
  assert.equal(down.side, 'R')
  assert.equal(down.from, 0.4)
  assert.equal(down.to, 0.8)

  // Ballot measures read YES / NO.
  const measure = toSwing(
    timeline('Measure', ramp(0.7, 0.4), { office: 'measure', state: 'CA' }),
    TIMES,
    POLLS
  )!
  assert.equal(measure.side, 'NO')
  assert.equal(measure.sideLabel, 'No')
  assert.equal(measure.from, 0.3)
  assert.equal(measure.to, 0.6)
  const passed = toSwing(
    timeline('Passed', ramp(0.5, 0.8), {
      office: 'measure',
      result: { value: 1 },
    }),
    TIMES,
    POLLS
  )!
  assert.equal(passed.side, 'YES')
  assert.equal(passed.sideLabel, 'Yes')
})

test('a race unpriced a week out has no swing', () => {
  const values: (number | undefined)[] = ramp(0.4, 0.6)
  values[0] = undefined
  assert.equal(toSwing(timeline('Late', values), TIMES, POLLS), undefined)
})

test('races rank by how far they moved, written-off and safe ones excluded', () => {
  const ranked = rankSwings(
    [
      // Small move.
      timeline('Small', ramp(0.45, 0.55)),
      // The winner was at 20% a week out.
      timeline('Big upset', ramp(0.2, 0.4), { result: { value: 1 } }),
      // The winner was given 2%: written off (or a misread market).
      timeline('Written off', ramp(0.02, 0.5), { result: { value: 1 } }),
      // Safe all week: above 95% throughout.
      timeline('Safe', ramp(0.96, 0.99), { result: { value: 1 } }),
      // Medium.
      timeline('Medium', ramp(0.5, 0.8)),
    ],
    TIMES,
    POLLS
  )
  assert.deepEqual(
    ranked.map((s) => s.label),
    ['Big upset', 'Medium', 'Small']
  )
  assert.equal(ranked[0].to - ranked[0].from, 0.8)

  // The limit keeps the biggest.
  assert.deepEqual(
    rankSwings(
      [
        timeline('A', ramp(0.45, 0.55)),
        timeline('B', ramp(0.2, 0.9)),
        timeline('C', ramp(0.4, 0.8)),
      ],
      TIMES,
      POLLS,
      2
    ).map((s) => s.label),
    ['B', 'C']
  )
})

test('a race that dipped into play mid-week still counts', () => {
  // Safe at both ends but 60% in the middle.
  const values = TIMES.map((_, i) => (i > 30 && i < 50 ? 0.6 : 0.97))
  const analysis = analyzeSwing(
    timeline('Scare', values, { result: { value: 1 } }),
    TIMES,
    POLLS
  )!
  assert.equal(analysis.lo, 0.6)
  assert.equal(isCompetitiveSwing(analysis), true)
})

test('the Senate and House control markets always lead the list', () => {
  const ranked = rankSwings(
    [
      timeline('Big upset', ramp(0.2, 0.4), { result: { value: 1 } }),
      // Barely moved and never competitive, but it's the headline.
      timeline('House control', ramp(0.97, 0.98), {
        office: 'control',
        state: undefined,
        result: { value: 1 },
      }),
      timeline('Senate control', ramp(0.7, 0.8), {
        office: 'control',
        state: undefined,
        result: { value: 1 },
      }),
    ],
    TIMES,
    POLLS,
    1
  )
  assert.deepEqual(
    ranked.map((s) => s.label),
    ['House control', 'Senate control', 'Big upset']
  )
  assert.equal(ranked[0].office, 'control')
  assert.equal(ranked[0].state, undefined)
})

test('the sparkline keeps the first and last points, then the result', () => {
  const values = TIMES.map((_, i) => 0.3 + 0.2 * Math.sin(i / 7))
  const swing = toSwing(
    timeline('Wavy', values, { result: { value: 1, time: 2_000 * HOUR } }),
    TIMES,
    POLLS
  )!
  // Up to SPARKLINE_POINTS from the window, plus the resolved point.
  assert.equal(swing.points.length, SPARKLINE_POINTS + 1)
  assert.deepEqual(swing.points[0], [TIMES[0], swing.from])
  assert.equal(swing.points[SPARKLINE_POINTS - 1][0], TIMES[TIMES.length - 1])
  assert.deepEqual(swing.points[SPARKLINE_POINTS], [2_000 * HOUR, 1])
  // Times never go backwards.
  for (let i = 1; i < swing.points.length; i++)
    assert.ok(swing.points[i][0] > swing.points[i - 1][0])

  // A result settled inside the window still lands after its last frame.
  const early = toSwing(
    timeline('Early call', ramp(0.4, 0.9), { result: { value: 1, time: 1 } }),
    TIMES,
    POLLS
  )!
  const [lastTime] = early.points[early.points.length - 1]
  assert.ok(lastTime > TIMES[TIMES.length - 1])
})

test('downsampling keeps both ends and caps the count', () => {
  const points = Array.from({ length: 500 }, (_, x) => ({ x, y: (x * 7) % 11 }))
  const sampled = downsample(points, 40)
  assert.equal(sampled.length, 40)
  assert.equal(sampled[0], points[0])
  assert.equal(sampled[sampled.length - 1], points[points.length - 1])
  // Short series pass through untouched.
  assert.deepEqual(downsample(points.slice(0, 10), 40), points.slice(0, 10))
  assert.deepEqual(downsample(points, 2), [points[0], points[499]])
})
