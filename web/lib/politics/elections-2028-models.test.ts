import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  initialsOf,
  isCandidateAnswer,
  lookupCandidate,
  normalizeCandidateName,
} from './candidates'
import {
  bucketWidth,
  decodeHistory,
  encodeHistory,
  probAt,
  sliceFrom,
  thinHistory,
  TimePoint,
} from './race-history'
import { STATE_MARKETS_2028, UNIT_PRIORS_2028 } from './elections-2028-config'
import {
  ELECTORAL_UNITS,
  EV_TO_WIN,
  inverseNormalCdf,
  makeNormal,
  makeRng,
  ratingOf,
  simulateElectoralCollege,
  TOTAL_EV,
} from './ec-model'

const DAY = 24 * 60 * 60 * 1000

test('candidate names normalize across community spellings', () => {
  assert.equal(normalizeCandidateName('J.D. Vance'), 'j d vance')
  assert.equal(normalizeCandidateName('Raphael Warnock '), 'raphael warnock')
  assert.equal(
    normalizeCandidateName('Jon Ossoff (Georgia Senator)'),
    'jon ossoff'
  )
  assert.equal(
    normalizeCandidateName('Alexandria Ocasio-Cortez'),
    normalizeCandidateName('Alexandria Ocasio Cortez')
  )
  assert.equal(normalizeCandidateName('Tulsi Gabbard\n'), 'tulsi gabbard')
})

test('lookups find the same person under different spellings', () => {
  for (const text of ['J.D. Vance', 'JD Vance', 'JD Vance (Vice President)'])
    assert.equal(lookupCandidate(text).shortName, 'Vance', text)
  assert.equal(
    lookupCandidate('Ron Desantis').photo,
    lookupCandidate('Ron DeSantis').photo
  )
  // The registry's first (properly capitalized) spelling is the display name.
  assert.equal(lookupCandidate('Ron Desantis').name, 'Ron DeSantis')
  assert.equal(
    lookupCandidate('JD Vance').key,
    lookupCandidate('J.D. Vance').key
  )
  assert.equal(lookupCandidate('Donald Trump Jr').shortName, 'Trump Jr.')
  assert.equal(lookupCandidate('Bernie Sanders').shortName, 'Bernie')
  assert.equal(lookupCandidate('JB Pritzker').shortName, 'Pritzker')
  assert.equal(lookupCandidate('Donald Trump, Sr').shortName, 'Trump')
  assert.equal(
    lookupCandidate('Donald J. Trump (45th  & 47th President)').shortName,
    'Trump'
  )
  assert.equal(lookupCandidate('Gavin Newsom').party, 'D')
  assert.equal(lookupCandidate('Marco Rubio').party, 'R')
})

test('unknown candidates still get a name, short name and initials', () => {
  const c = lookupCandidate('Zelda Q. Example (Some Governor)')
  assert.equal(c.name, 'Zelda Q. Example')
  assert.equal(c.shortName, 'Example')
  assert.equal(c.initials, 'ZE')
  assert.equal(c.party, undefined)
  assert.equal(c.photo, undefined)
  assert.equal(initialsOf('Donald Trump Jr.'), 'DT')
})

test('Other and joke answers are not candidates', () => {
  assert.equal(isCandidateAnswer('Other'), false)
  assert.equal(isCandidateAnswer(' No 2028 Election '), false)
  assert.equal(isCandidateAnswer('Gavin Newsom'), true)
})

test('history thinning keeps the first and last points and bucket medians', () => {
  const now = 1_000 * DAY
  // A point every hour for the last 3 days: 6-hour buckets keep ~1 in 6.
  const pts: TimePoint[] = []
  for (let h = 72; h >= 0; h--) pts.push([now - h * 3600_000, h / 100])
  const thin = thinHistory(pts, now)
  assert.deepEqual(thin[0], pts[0])
  assert.deepEqual(thin[thin.length - 1], pts[pts.length - 1])
  assert.ok(thin.length < pts.length / 3, `${thin.length} points`)
  // Sorted, no duplicates.
  for (let i = 1; i < thin.length; i++) assert.ok(thin[i][0] > thin[i - 1][0])
  // A bucket's value is the median of its trades, so a one-trade spike
  // doesn't show.
  const spiky: TimePoint[] = [
    [now - 30 * DAY, 0.2],
    [now - 20 * DAY + 1_000, 0.2],
    [now - 20 * DAY + 2_000, 0.9],
    [now - 20 * DAY + 3_000, 0.21],
    [now, 0.25],
  ]
  const smooth = thinHistory(spiky, now)
  assert.ok(
    smooth.every(([, p]) => p < 0.5),
    JSON.stringify(smooth)
  )
  // Out-of-order and non-finite input is handled.
  const messy: TimePoint[] = [
    [now - 2 * DAY, 0.2],
    [now - 10 * DAY, 0.1],
    [NaN, 0.5],
    [now - DAY, Infinity],
  ]
  assert.deepEqual(thinHistory(messy, now), [
    [now - 10 * DAY, 0.1],
    [now - 2 * DAY, 0.2],
  ])
})

test('bucket widths widen with age', () => {
  assert.ok(bucketWidth(DAY) < bucketWidth(30 * DAY))
  assert.ok(bucketWidth(30 * DAY) < bucketWidth(100 * DAY))
  assert.ok(bucketWidth(100 * DAY) < bucketWidth(1000 * DAY))
})

test('history encodes and decodes to the second and basis point', () => {
  const pts: TimePoint[] = [
    [1_700_000_000_123, 0.12345],
    [1_700_000_600_456, 0.5],
    [1_700_086_400_000, 1.2], // clamped
  ]
  const decoded = decodeHistory(encodeHistory(pts))
  assert.equal(decoded.length, 3)
  assert.equal(decoded[0][0], 1_700_000_000_000)
  assert.equal(decoded[0][1], 0.1235)
  assert.equal(decoded[2][1], 1)
  assert.deepEqual(decodeHistory(encodeHistory([])), [])
})

test('probAt and sliceFrom read a step function', () => {
  const pts: TimePoint[] = [
    [10, 0.1],
    [20, 0.2],
    [30, 0.3],
  ]
  assert.equal(probAt(pts, 5), 0.1)
  assert.equal(probAt(pts, 20), 0.2)
  assert.equal(probAt(pts, 29), 0.2)
  assert.equal(probAt(pts, 99), 0.3)
  assert.equal(probAt([], 1), undefined)
  assert.deepEqual(sliceFrom(pts, 25), [
    [25, 0.2],
    [30, 0.3],
  ])
  assert.deepEqual(sliceFrom(pts, 0), pts)
})

test('the electoral units add up to 538', () => {
  assert.equal(
    ELECTORAL_UNITS.reduce((s, u) => s + u.ev, 0),
    TOTAL_EV
  )
  assert.equal(ELECTORAL_UNITS.length, 56)
  assert.equal(new Set(ELECTORAL_UNITS.map((u) => u.key)).size, 56)
  assert.equal(EV_TO_WIN, 270)
})

test('inverse normal CDF matches known quantiles', () => {
  assert.ok(Math.abs(inverseNormalCdf(0.5)) < 1e-9)
  assert.ok(Math.abs(inverseNormalCdf(0.975) - 1.959964) < 1e-5)
  assert.ok(Math.abs(inverseNormalCdf(0.01) + 2.326348) < 1e-5)
  assert.ok(Number.isFinite(inverseNormalCdf(0)))
  assert.ok(Number.isFinite(inverseNormalCdf(1)))
})

test('normal draws have mean 0 and variance 1', () => {
  const normal = makeNormal(makeRng(7))
  let s = 0
  let s2 = 0
  const n = 50000
  for (let i = 0; i < n; i++) {
    const x = normal()
    s += x
    s2 += x * x
  }
  assert.ok(Math.abs(s / n) < 0.02)
  assert.ok(Math.abs(s2 / n - 1) < 0.03)
})

const all = (p: number) =>
  Object.fromEntries(ELECTORAL_UNITS.map((u) => [u.key, p]))

test('a near-certainty everywhere gives the Democrat nearly every vote', () => {
  // Chances are floored at 0.5% / 99.5% (markets never reach 0 or 100), so a
  // "sure thing" can still very occasionally slip.
  const r = simulateElectoralCollege(all(1), { sims: 5000 })
  assert.ok(r.pDem > 0.99, `${r.pDem}`)
  assert.ok(r.meanDemEv > TOTAL_EV - 10, `${r.meanDemEv}`)
  assert.equal(r.unitProbs.CA, 0.995)
})

test('each unit keeps its market chance in the simulation', () => {
  const probs = all(0.5)
  probs.PA = 0.8
  probs.TX = 0.15
  const r = simulateElectoralCollege(probs, { sims: 40000, rho: 0.75 })
  // Mean Democratic EVs is the EV-weighted sum of the unit chances.
  const expected = ELECTORAL_UNITS.reduce(
    (s, u) => s + u.ev * r.unitProbs[u.key],
    0
  )
  assert.ok(
    Math.abs(r.meanDemEv - expected) < 3,
    `${r.meanDemEv} vs ${expected}`
  )
  assert.ok(Math.abs(r.pDem + r.pRep + r.pTie - 1) < 1e-9)
  const totalP = r.distribution.reduce((s, p) => s + p, 0)
  assert.ok(Math.abs(totalP - 1) < 1e-9)
})

test('correlation widens the outcomes', () => {
  const probs = all(0.55)
  const loose = simulateElectoralCollege(probs, { sims: 20000, rho: 0.05 })
  const tight = simulateElectoralCollege(probs, { sims: 20000, rho: 0.9 })
  // Independent coin flips concentrate near the mean; correlated ones spread.
  const sd = (r: typeof loose) =>
    Math.sqrt(
      r.distribution.reduce((s, p, k) => s + p * (k - r.meanDemEv) ** 2, 0)
    )
  assert.ok(sd(tight) > 2 * sd(loose))
  // Slight favourite everywhere: independence makes the win near-certain,
  // correlation keeps it uncertain.
  assert.ok(loose.pDem > tight.pDem)
})

test('the simulation is reproducible with a seed', () => {
  const probs = all(0.5)
  const a = simulateElectoralCollege(probs, { sims: 2000, seed: 3 })
  const b = simulateElectoralCollege(probs, { sims: 2000, seed: 3 })
  assert.deepEqual(a, b)
})

test('tipping points come from the close units', () => {
  const probs = all(0.02) // safe Republican
  for (const k of ['CA', 'NY', 'IL', 'NJ', 'WA', 'MA', 'MD', 'OR', 'CT', 'VA'])
    probs[k] = 0.98 // safe Democratic
  for (const k of ['PA', 'MI', 'WI', 'GA', 'AZ', 'NC', 'NV']) probs[k] = 0.5
  const r = simulateElectoralCollege(probs, { sims: 20000 })
  const top = r.tippingPoints.slice(0, 3).map((t) => t.key)
  for (const k of top)
    assert.ok(
      ['PA', 'MI', 'WI', 'GA', 'AZ', 'NC', 'NV', 'TX', 'FL', 'OH'].includes(k),
      k
    )
  const totalTip = r.tippingPoints.reduce((s, t) => s + t.p, 0)
  assert.ok(Math.abs(totalTip - 1) < 1e-9)
})

test('missing unit probabilities are an error', () => {
  const probs = all(0.5)
  delete probs['NE-2']
  assert.throws(() => simulateElectoralCollege(probs, { sims: 10 }), /NE-2/)
})

test('rating buckets follow whole-percent thresholds', () => {
  assert.equal(ratingOf(0.9), 'safeD')
  assert.equal(ratingOf(0.894), 'likelyD')
  assert.equal(ratingOf(0.6), 'leanD')
  assert.equal(ratingOf(0.5), 'tossup')
  assert.equal(ratingOf(0.4), 'leanR')
  assert.equal(ratingOf(0.11), 'likelyR')
  // Symmetric with safeD: a 10% Democratic chance is a 90% Republican one.
  assert.equal(ratingOf(0.104), 'safeR')
  assert.equal(ratingOf(0.02), 'safeR')
})

test('every electoral unit has a fallback prior, and only real units have markets', () => {
  const keys = new Set(ELECTORAL_UNITS.map((u) => u.key))
  for (const u of ELECTORAL_UNITS) {
    const p = UNIT_PRIORS_2028[u.key]
    assert.ok(Number.isFinite(p) && p > 0 && p < 1, `${u.key}: ${p}`)
  }
  for (const k of Object.keys(UNIT_PRIORS_2028)) assert.ok(keys.has(k), k)
  for (const k of Object.keys(STATE_MARKETS_2028)) assert.ok(keys.has(k), k)
})
