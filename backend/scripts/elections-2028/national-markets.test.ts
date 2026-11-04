// node:test suite for the national market script. From the repo root:
//   TS_NODE_PROJECT=backend/scripts/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 \
//   node --no-experimental-strip-types -r ts-node/register -r tsconfig-paths/register \
//     --test backend/scripts/elections-2028/national-markets.test.ts

import { test } from 'node:test'
import * as assert from 'node:assert/strict'
import { randomStringRegex } from 'common/util/random'
import { getAnswerProbsError } from 'common/new-contract'
import {
  binaryPartySeeds,
  candidateSeeds,
  canonicalCandidate,
  derivedVpSeeds,
  evBucketSeeds,
  fitWithOther,
  flattenedSeeds,
  floorAndNormalize,
  isNonCandidate,
  marginBucketSeeds,
  normCdf,
  normInv,
  partyShares,
  reservedIdFor,
  SourceAnswer,
  threePartySeeds,
  twoPartySeeds,
} from './seeds'
import {
  buildPayload,
  costOf,
  DEM,
  ENTRIES,
  Entry,
  MultiEntry,
  priceMismatches,
  REP,
  resolveSeed,
  seedError,
  SERIES,
  SOURCES,
  SourceMarket,
  validateEntries,
} from './national-markets'
import { buildPhotoIndex, parsePhotoRegistry, photoPathFor } from './photos'
import { similarQuestions } from './create-national-markets'

const NOW = Date.parse('2026-11-05T00:00:00Z')
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0)
const near = (a: number, b: number, tol: number) =>
  assert.ok(Math.abs(a - b) <= tol, `${a} not within ${tol} of ${b}`)

// ------------------------------------------------------------------ names

test('candidate names normalize across community spellings', () => {
  const key = (t: string) => canonicalCandidate(t)?.key
  const display = (t: string) => canonicalCandidate(t)?.display
  assert.equal(key('J.D. Vance'), key('JD Vance'))
  assert.equal(display('J.D. Vance'), 'JD Vance')
  assert.equal(display('JD Vance (Vice President)'), 'JD Vance')
  assert.equal(display('Ron Desantis'), 'Ron DeSantis')
  assert.equal(key('Donald Trump, Sr'), key('Donald J. Trump'))
  assert.equal(key('Donald Trump'), key('Donald J. Trump'))
  assert.equal(display('Donald Trump Jr'), 'Donald Trump Jr.')
  assert.equal(key('Donald Trump Jr'), key('Donald Trump Jr.'))
  assert.notEqual(key('Donald Trump Jr.'), key('Donald Trump'))
  assert.equal(display('Raphael Warnock '), 'Raphael Warnock')
  assert.equal(display('Tulsi Gabbard\n'), 'Tulsi Gabbard')
  assert.equal(display('Alexandria Ocasio Cortez'), 'Alexandria Ocasio-Cortez')
  assert.equal(key('J.B. Pritzker'), key('JB Pritzker'))
  assert.equal(display('J. B. Pritzker'), 'JB Pritzker')
  assert.equal(key('Robert F. Kennedy Jr.'), key('Robert F Kennedy Jr'))
  assert.notEqual(key('John N. Kennedy'), key('Robert F. Kennedy Jr.'))
  for (const t of [
    'Other',
    'No 2028 Election',
    'No one',
    'None of the above',
    'N/A',
    '[Invalid entry - Will resolve NO]',
    'Duplicate of Gavin Newsom',
  ])
    assert.ok(isNonCandidate(t), t)
  assert.ok(!isNonCandidate('Gavin Newsom'))
  assert.equal(canonicalCandidate('No 2028 Election'), undefined)
})

// ------------------------------------------------------------------ seeds

const DEM_NOMINEE: SourceAnswer[] = [
  { text: 'Jon Ossoff', probability: 0.2273 },
  { text: 'Alexandria Ocasio-Cortez', probability: 0.1435 },
  { text: 'Other', probability: 0.1395, isOther: true },
  { text: 'Gavin Newsom', probability: 0.1315 },
  { text: 'Kamala Harris', probability: 0.0638 },
  { text: 'Pete Buttigieg', probability: 0.0449 },
  { text: 'Josh Shapiro', probability: 0.0439 },
  { text: 'Andy Beshear', probability: 0.0314 },
  { text: 'Gretchen Whitmer', probability: 0.0236 },
  { text: 'Mark Kelly', probability: 0.0235 },
  { text: 'Raphael Warnock', probability: 0.0226 },
  { text: 'J.B. Pritzker', probability: 0.0196 },
  { text: 'Ro Khanna', probability: 0.0112 },
  { text: 'Wes Moore', probability: 0.0086 },
  { text: 'Michelle Obama', probability: 0.0083 },
  { text: 'No 2028 Election', probability: 0.02 },
  { text: 'Bernie Sanders', probability: 0.0065 },
  ...Array.from({ length: 40 }, (_, i) => ({
    text: `Long Shot ${i}`,
    probability: 0.0009,
  })),
]

const checkWithOther = (pcts: number[], other: number) => {
  for (const p of pcts) assert.ok(p >= 1 && p <= 99, `pct ${p}`)
  assert.ok(sum(pcts) <= 99 + 1e-9, `sum ${sum(pcts)}`)
  near(other, 100 - sum(pcts), 0.051)
  assert.ok(other >= 1, `other ${other}`)
  assert.equal(
    getAnswerProbsError({
      answerProbs: pcts,
      numAnswers: pcts.length,
      shouldAnswersSumToOne: true,
      hasOtherAnswer: true,
    }),
    undefined
  )
}

test('candidateSeeds copies the field at or above 1% and leaves the rest to Other', () => {
  const { seeds, otherPct } = candidateSeeds(DEM_NOMINEE, {
    minProb: 0.01,
    maxAnswers: 20,
  })
  assert.deepEqual(
    seeds.map((s) => s.text),
    [
      'Jon Ossoff',
      'Alexandria Ocasio-Cortez',
      'Gavin Newsom',
      'Kamala Harris',
      'Pete Buttigieg',
      'Josh Shapiro',
      'Andy Beshear',
      'Gretchen Whitmer',
      'Mark Kelly',
      'Raphael Warnock',
      'JB Pritzker',
      'Ro Khanna',
    ]
  )
  assert.equal(seeds[0].pct, 22.7)
  checkWithOther(
    seeds.map((s) => s.pct),
    otherPct
  )
  const top3 = candidateSeeds(DEM_NOMINEE, { maxAnswers: 3 })
  assert.equal(top3.seeds.length, 3)
})

test('candidateSeeds merges duplicate spellings', () => {
  const { seeds } = candidateSeeds([
    { text: 'J.D. Vance', probability: 0.2 },
    { text: 'JD Vance', probability: 0.1 },
    { text: 'Marco Rubio', probability: 0.2 },
    { text: 'Other', probability: 0.5, isOther: true },
  ])
  assert.deepEqual(seeds, [
    { text: 'JD Vance', pct: 30 },
    { text: 'Marco Rubio', pct: 20 },
  ])
})

test('fitWithOther keeps every answer at 1% and Other at 1% or more', () => {
  const out = fitWithOther([70, 40, 0.3, 5])
  checkWithOther(out, 100 - sum(out))
  assert.equal(out[2], 1)
  assert.ok(out[0] > out[1] && out[1] > out[3])
  // 99 answers at 1% leave exactly 1% for Other; 100 can't fit.
  assert.equal(sum(fitWithOther(Array(99).fill(1))), 99)
  assert.throws(() => fitWithOther(Array(100).fill(1)))
})

test('floorAndNormalize sums to exactly 100 with floors', () => {
  for (const probs of [
    [0.5, 0.5],
    [0.999, 0.001],
    [0.2, 0.0001, 0.3, 0.4999],
    [0, 0, 1],
  ]) {
    const out = floorAndNormalize(probs)
    assert.equal(Math.round(sum(out) * 10) / 10, 100, `${probs} -> ${out}`)
    for (const p of out) assert.ok(p >= 1 && p <= 99, `${out}`)
  }
})

test('party helpers', () => {
  const shares = partyShares([
    { text: 'Democratic Party', probability: 0.666 },
    { text: 'Republican Party', probability: 0.3245 },
    { text: 'Other Party', probability: 0.0095 },
  ])
  near(shares.dem, 0.666, 1e-9)
  near(shares.other, 0.0095, 1e-9)
  assert.deepEqual(binaryPartySeeds(0.332, 'Republican Party'), {
    dem: 66.8,
    rep: 33.2,
  })
  assert.deepEqual(binaryPartySeeds(0.7, 'Democratic Party'), {
    dem: 70,
    rep: 30,
  })
  const two = twoPartySeeds(
    partyShares([
      { text: 'Republicans', probability: 0.501 },
      { text: 'Democrats', probability: 0.499 },
    ])
  )
  assert.equal(two.dem + two.rep, 100)
  assert.deepEqual(
    threePartySeeds(
      partyShares([
        { text: 'The Democratic Party', probability: 0.755 },
        { text: 'The Republican Party', probability: 0.245 },
      ])
    ),
    { dem: 74.7, rep: 24.3, other: 1 }
  )
  const lopsided = threePartySeeds({ dem: 1, rep: 0, other: 0 })
  assert.ok(lopsided.rep >= 1 && lopsided.other === 1)
})

test('derived VP seeds weight each running mate by the party odds', () => {
  const { seeds, otherPct } = derivedVpSeeds(
    [
      { text: 'Alpha Person', probability: 0.5 },
      { text: 'Beta Person', probability: 0.2 },
      { text: 'Other', probability: 0.3, isOther: true },
    ],
    [
      { text: 'Gamma Person', probability: 0.6 },
      { text: 'Delta Person', probability: 0.005 },
      { text: 'Other', probability: 0.395, isOther: true },
    ],
    { dem: 0.6, rep: 0.4, other: 0 }
  )
  assert.deepEqual(seeds, [
    { text: 'Alpha Person', pct: 30 },
    { text: 'Gamma Person', pct: 24 },
    { text: 'Beta Person', pct: 12 },
  ])
  assert.equal(otherPct, 34)
})

test('normal CDF and its inverse', () => {
  near(normCdf(0), 0.5, 1e-7)
  near(normCdf(1.959964), 0.975, 1e-6)
  near(normInv(0.975), 1.959964, 1e-5)
  for (const x of [-2.5, -1, -0.2, 0.3, 1.7, 3]) near(normInv(normCdf(x)), x, 1e-4)
  assert.throws(() => normInv(0))
  assert.throws(() => normInv(1))
})

test('electoral-vote buckets put P(270+) at the party odds', () => {
  for (const pDem of [0.35, 0.5, 0.672, 0.85]) {
    const pcts = evBucketSeeds(pDem, 60)
    assert.equal(pcts.length, 7)
    assert.equal(Math.round(sum(pcts) * 10) / 10, 100)
    for (const p of pcts) assert.ok(p >= 1)
    near(sum(pcts.slice(3)), pDem * 100, 1.5)
  }
  const extreme = evBucketSeeds(0.99, 60)
  for (const p of extreme) assert.ok(p >= 1)
})

test('popular-vote margin buckets put P(D>0) at the popular-vote odds', () => {
  for (const pDem of [0.3, 0.5, 0.755]) {
    const pcts = marginBucketSeeds(pDem, 4.5)
    assert.equal(Math.round(sum(pcts) * 10) / 10, 100)
    for (const p of pcts) assert.ok(p >= 1)
    near(sum(pcts.slice(3)), pDem * 100, 1.5)
  }
})

test('early-state seeds flatten the nominee field', () => {
  const nominee = candidateSeeds(DEM_NOMINEE)
  const flat = flattenedSeeds(DEM_NOMINEE, 0.8, 12)
  assert.equal(flat.seeds.length, 12)
  checkWithOther(
    flat.seeds.map((s) => s.pct),
    flat.otherPct
  )
  // The favorite loses share; a long shot gains relative to the favorite.
  assert.ok(flat.seeds[0].pct < nominee.seeds[0].pct)
  const ratio = (s: typeof flat) =>
    s.seeds.find((x) => x.text === 'Ro Khanna')!.pct / s.seeds[0].pct
  assert.ok(ratio(flat) > ratio(nominee))
  assert.equal(flat.seeds[0].text, 'Jon Ossoff')
})

test('state primaries open with three candidates, favoring home-state ones', () => {
  const plain = flattenedSeeds(DEM_NOMINEE, 0.8, 3)
  assert.deepEqual(
    plain.seeds.map((s) => s.text),
    ['Jon Ossoff', 'Alexandria Ocasio-Cortez', 'Gavin Newsom']
  )
  // Shapiro (4.4% nationally) makes Pennsylvania's three.
  const pa = flattenedSeeds(DEM_NOMINEE, 0.8, 3, { state: 'PA', boost: 3 })
  assert.deepEqual(
    pa.seeds.map((s) => s.text),
    ['Jon Ossoff', 'Josh Shapiro', 'Alexandria Ocasio-Cortez']
  )
  checkWithOther(
    pa.seeds.map((s) => s.pct),
    pa.otherPct
  )
  // A state with nobody from it in the field gets the national three.
  const ia = flattenedSeeds(DEM_NOMINEE, 0.8, 3, { state: 'IA', boost: 3 })
  assert.deepEqual(ia, plain)
  assert.throws(() => flattenedSeeds(DEM_NOMINEE, 0.8, 3, { state: 'PA', boost: 0.5 }))
})

// ------------------------------------------------------------------ ids

test('reserved ids are deterministic, valid and unique', () => {
  const a = reservedIdFor(SERIES, '2028-dem-nominee')
  assert.equal(a, reservedIdFor(SERIES, '2028-dem-nominee'))
  assert.equal(a.length, 10)
  assert.ok(randomStringRegex.test(a))
  assert.notEqual(a, reservedIdFor(SERIES, '2028-gop-nominee'))
  assert.notEqual(a, reservedIdFor('other-series', '2028-dem-nominee'))
  const ids = ENTRIES.map((e) => reservedIdFor(SERIES, e.key))
  assert.equal(new Set(ids).size, ids.length)
  for (const id of ids) assert.ok(randomStringRegex.test(id), id)
})

// ------------------------------------------------------------------ manifest

test('the manifest covers the planned markets and validates', () => {
  assert.deepEqual(validateEntries(ENTRIES, NOW), [])
  // 31 national markets (control of Congress through 2036) plus a primary for
  // each party in every state and DC.
  assert.equal(ENTRIES.length, 31 + 102)
  const keys = ENTRIES.map((e) => e.key)
  for (const k of [
    '2028-dem-nominee',
    '2028-gop-nominee',
    '2028-dem-vp-nominee',
    '2028-gop-vp-nominee',
    '2028-vp-winner',
    '2028-popular-vote',
    '2028-dem-electoral-votes',
    '2028-popular-vote-margin',
    '2028-ec-popular-split',
    '2028-tipping-point',
    '2028-senate-control',
    '2028-house-control',
    '2028-trifecta',
    '2028-dem-contested-convention',
    '2028-gop-contested-convention',
    '2028-dem-iowa',
    '2028-gop-nevada',
    '2028-dem-california',
    '2028-gop-district-of-columbia',
    '2028-gop-wyoming',
    '2027-governor-kentucky',
    '2027-governor-mississippi',
    '2027-governor-louisiana',
    '2027-virginia-senate',
    '2027-virginia-house',
    '2030-senate-control',
    '2030-house-control',
    '2032-dem-nominee',
    '2032-gop-nominee',
    '2032-winner',
    '2032-senate-control',
    '2032-house-control',
    '2034-senate-control',
    '2034-house-control',
    '2036-senate-control',
    '2036-house-control',
  ])
    assert.ok(keys.includes(k), k)
  // No 2028 winner market: @ManifoldPolitics already owns one.
  assert.ok(!keys.includes('2028-winner'))
  assert.ok(
    !ENTRIES.some((e) =>
      /who will win the 2028 (us )?presidential election/i.test(e.question)
    )
  )
  for (const e of ENTRIES) {
    if (e.outcome !== 'MULTIPLE_CHOICE') continue
    if (e.addAnswersMode === 'DISABLED') assert.ok(e.answers?.length, e.key)
  }
})

test('every state and DC has an open primary for each party', () => {
  const primaries = ENTRIES.filter((e) => e.phase === 'primary') as MultiEntry[]
  assert.equal(primaries.length, 102)
  const states = new Set<string>()
  for (const e of primaries) {
    assert.equal(e.addAnswersMode, 'ANYONE', e.key)
    assert.equal(e.answers, undefined, e.key)
    assert.match(e.description, /^Resolves to the candidate with the most votes in the 2028 (Democratic|Republican) presidential /)
    assert.match(e.description, /N\/A if no (Democratic|Republican) contest is held/)
    if (e.seed.kind !== 'flattened-nominee') assert.fail(`${e.key}: seed ${e.seed.kind}`)
    assert.equal(e.seed.maxAnswers, 3)
    assert.equal(e.seed.homeBoost, 3)
    assert.match(e.seed.homeState ?? '', /^[A-Z]{2}$/)
    states.add(`${e.seed.homeState}-${e.key.split('-')[1]}`)
  }
  assert.equal(states.size, 102)
  const questions = primaries.map((e) => e.question)
  assert.ok(questions.includes('Who will win the 2028 Iowa Democratic presidential caucuses?'))
  assert.ok(
    questions.includes(
      'Who will win the District of Columbia in the 2028 Republican presidential primaries?'
    )
  )
})

test('party markets list both parties and leave Other open to @ManifoldPolitics', async () => {
  for (const key of [
    '2027-governor-kentucky',
    '2027-governor-mississippi',
    '2027-governor-louisiana',
    '2028-popular-vote',
  ]) {
    const e = ENTRIES.find((x) => x.key === key) as MultiEntry
    assert.equal(e.addAnswersMode, 'ONLY_CREATOR', key)
    assert.deepEqual(e.answers, [DEM, REP], key)
    assert.match(e.description, /Only the party matters/, key)
    assert.match(e.description, /Anyone else resolves to Other, or to their own answer/, key)
  }
  const ky = await resolveSeed(ENTRIES.find((x) => x.key === '2027-governor-kentucky')!)
  if (ky.outcome !== 'MULTIPLE_CHOICE') assert.fail('KY seed')
  assert.deepEqual(ky.answerProbs, [24, 75])
  assert.equal(ky.otherPct, 1)
  // Chamber control has no third answer: independents count with their caucus.
  const control = ENTRIES.find((x) => x.key === '2028-senate-control') as MultiEntry
  assert.equal(control.addAnswersMode, 'DISABLED')
})

test('descriptions say only what decides the market', () => {
  for (const e of ENTRIES) {
    // Tod, 5 Nov 2026: nothing about who adds answers, how the odds opened,
    // or links elsewhere; keep it short.
    assert.doesNotMatch(e.description, /opening odds|curated|@ManifoldPolitics|manifold\.markets|\]\(/i, e.key)
    assert.match(e.description, /^Resolves /, e.key)
    assert.ok(e.description.length <= 500, `${e.key}: ${e.description.length} chars`)
  }
})

test('presidential markets hold up under any system for choosing the President', () => {
  const get = (key: string) => ENTRIES.find((x) => x.key === key)!.description
  // Tod, 5 Nov 2026: word them for whoever is officially elected, however
  // that's decided, and leave the Electoral College out where possible.
  for (const key of ['2028-vp-winner', '2032-winner', '2028-ec-popular-split', '2028-popular-vote'])
    assert.doesNotMatch(get(key), /electoral|Congress|\b270\b/i, key)
  for (const key of ['2028-vp-winner', '2032-winner', '2028-ec-popular-split'])
    assert.match(get(key), /however the winner is officially decided/, key)
  // Markets that only make sense with electoral votes say what happens without them.
  for (const key of ['2028-dem-electoral-votes', '2028-tipping-point'])
    assert.match(get(key), /N\/A if .*no longer chosen by electoral votes\.$/, key)
})

const clone = (e: Entry): Entry => JSON.parse(JSON.stringify(e))

test('validation catches broken entries', () => {
  const base = ENTRIES.find((e) => e.key === '2028-house-control')!
  const long = clone(base)
  long.question = 'x'.repeat(121) + '?'
  assert.ok(validateEntries([long], NOW).some((m) => /chars/.test(m)))

  const topics = clone(base)
  topics.topics = ['a', 'b', 'c', 'd', 'e', 'f']
  assert.ok(validateEntries([topics], NOW).some((m) => /topics/.test(m)))

  assert.ok(
    validateEntries([base, clone(base)], NOW).some((m) => /duplicate key/.test(m))
  )

  const early = clone(base)
  early.closeTime = '2028-11-07T12:00:00Z'
  assert.ok(validateEntries([early], NOW).some((m) => /after election day/.test(m)))

  const past = clone(base)
  past.closeTime = '2026-01-01T00:00:00Z'
  assert.ok(validateEntries([past], NOW).some((m) => /past/.test(m)))

  const badSum = clone(base) as MultiEntry
  badSum.seed = { kind: 'static-fixed', pcts: [70, 20], note: 'x' }
  assert.ok(validateEntries([badSum], NOW).some((m) => /add up/.test(m)))

  const primary = clone(ENTRIES.find((e) => e.key === '2028-dem-iowa')!)
  primary.closeTime = '2028-10-15T12:00:00Z'
  const nomination = ENTRIES.find((e) => e.key === '2028-dem-nominee')!
  assert.ok(
    validateEntries([primary, nomination], NOW).some((m) => /no later than/.test(m))
  )
})

// A reader serving plausible community markets for every seed source.
const FIXTURES: Record<string, SourceMarket> = {
  [SOURCES.demNominee2028]: market(DEM_NOMINEE),
  [SOURCES.gopNominee2028]: market([
    { text: 'JD Vance', probability: 0.3161 },
    { text: 'Other', probability: 0.199, isOther: true },
    { text: 'Marco Rubio', probability: 0.1893 },
    { text: 'Ron Desantis', probability: 0.1222 },
    { text: 'Donald Trump Jr', probability: 0.0294 },
    { text: 'Thomas Massie', probability: 0.0217 },
    { text: 'Tucker Carlson', probability: 0.021 },
    { text: 'Ted Cruz', probability: 0.0169 },
    { text: 'Donald Trump, Sr', probability: 0.0161 },
    { text: 'Brian Kemp', probability: 0.0122 },
    { text: 'Glenn Youngkin', probability: 0.0097 },
    { text: 'Nikki Haley', probability: 0.0055 },
    { text: 'Long tail', probability: 0.0449 },
  ]),
  [SOURCES.demVp2028]: market([
    { text: 'Other', probability: 0.335, isOther: true },
    { text: 'Roy Cooper', probability: 0.117 },
    { text: 'Alexandria Ocasio Cortez', probability: 0.08 },
    { text: 'Jon Ossoff', probability: 0.069 },
    { text: 'Pete Buttigieg', probability: 0.062 },
    { text: 'Gretchen Whitmer', probability: 0.05 },
    { text: 'Andy Beshear', probability: 0.042 },
    { text: 'Raphael Warnock', probability: 0.036 },
    { text: 'James Talarico', probability: 0.034 },
    { text: 'Wes Moore', probability: 0.028 },
    { text: 'Josh Shapiro', probability: 0.025 },
    { text: 'Elissa Slotkin', probability: 0.023 },
    { text: 'Gavin Newsom', probability: 0.018 },
    { text: 'Long tail', probability: 0.081 },
  ]),
  [SOURCES.gopVp2028]: market([
    { text: 'Other', probability: 0.518, isOther: true },
    { text: 'Marco Rubio', probability: 0.241 },
    { text: 'Donald Trump Jr.', probability: 0.047 },
    { text: 'J.D. Vance', probability: 0.042 },
    { text: 'Tucker Carlson', probability: 0.035 },
    { text: 'Glenn Youngkin', probability: 0.016 },
    { text: 'Long tail', probability: 0.101 },
  ]),
  [SOURCES.party2028]: market([
    { text: 'Democratic Party', probability: 0.6661 },
    { text: 'Republican Party', probability: 0.3245 },
    { text: 'Other Party', probability: 0.0094 },
  ]),
  [SOURCES.popularVote2028]: market([
    { text: 'The Democratic Party', probability: 0.755 },
    { text: 'The Republican Party', probability: 0.245 },
  ]),
  [SOURCES.senateRep2028]: {
    id: SOURCES.senateRep2028,
    question: 'Will Republicans win the Senate in the 2028 elections?',
    outcomeType: 'BINARY',
    isResolved: false,
    probability: 0.3324,
    uniqueBettorCount: 20,
  },
  [SOURCES.senate2030]: market([
    { text: 'Republicans', probability: 0.501 },
    { text: 'Democrats', probability: 0.499 },
  ]),
  [SOURCES.demNominee2032]: market([
    { text: 'Other', probability: 0.591, isOther: true },
    { text: 'Gavin Newsom', probability: 0.123 },
    { text: 'Alexandria Ocasio-Cortez', probability: 0.1 },
    { text: 'Pete Buttigieg', probability: 0.062 },
    { text: 'Josh Shapiro', probability: 0.058 },
    { text: 'Gretchen Whitmer', probability: 0.054 },
    { text: 'Long tail', probability: 0.012 },
  ]),
  [SOURCES.winner2032]: market([
    { text: 'Other', probability: 0.387, isOther: true },
    { text: 'Marco Rubio', probability: 0.078 },
    { text: 'J.D. Vance', probability: 0.063 },
    { text: 'Gavin Newsom', probability: 0.059 },
    { text: 'Alexandria Ocasio-Cortez', probability: 0.052 },
    { text: 'Tulsi Gabbard\n', probability: 0.041 },
    { text: 'Jon Ossoff', probability: 0.03 },
    { text: 'Pete Buttigieg\n', probability: 0.028 },
    { text: 'Gretchen Whitmer', probability: 0.026 },
    { text: 'Kamala Harris\n', probability: 0.024 },
    { text: 'No one', probability: 0.021 },
    { text: 'Ron DeSantis', probability: 0.021 },
    { text: 'Michelle Obama', probability: 0.017 },
    { text: 'Ted Cruz', probability: 0.016 },
    { text: 'Nikki Haley', probability: 0.016 },
    { text: 'Long tail', probability: 0.121 },
  ]),
}

function market(answers: SourceAnswer[]): SourceMarket {
  return {
    id: 'fixture',
    question: 'fixture',
    outcomeType: 'MULTIPLE_CHOICE',
    isResolved: false,
    answers,
    uniqueBettorCount: 100,
  }
}

const reader = async (id: string) => FIXTURES[id]

test('every entry resolves to opening odds the API accepts', async () => {
  for (const e of ENTRIES) {
    const seed = await resolveSeed(e, reader)
    assert.equal(seedError(e, seed), undefined, `${e.key}: ${seedError(e, seed)}`)
    const cost = costOf(e, seed)
    assert.ok(cost !== undefined && cost >= e.liquidityTier, e.key)
    if (seed.outcome === 'MULTIPLE_CHOICE' && e.outcome === 'MULTIPLE_CHOICE') {
      if (e.addAnswersMode !== 'DISABLED') assert.ok((seed.otherPct ?? 0) >= 1, e.key)
      else assert.equal(Math.round(sum(seed.answerProbs) * 10) / 10, 100, e.key)
    }
  }
})

test('VP-winner seeds from the fixtures', async () => {
  const e = ENTRIES.find((x) => x.key === '2028-vp-winner')!
  const seed = await resolveSeed(e, reader)
  assert.ok(seed.outcome === 'MULTIPLE_CHOICE')
  if (seed.outcome !== 'MULTIPLE_CHOICE') return
  // Cooper: 0.117 × 0.6661 ≈ 7.8%; Rubio: 0.241 × 0.3245 ≈ 7.8%.
  near(seed.answerProbs[seed.answers.indexOf('Roy Cooper')], 7.8, 0.1)
  near(seed.answerProbs[seed.answers.indexOf('Marco Rubio')], 7.8, 0.1)
  assert.ok(!seed.answers.includes('Glenn Youngkin')) // 0.016 × 0.3245 < 1%
})

test('static-seeded entries resolve offline; live ones need a reader', async () => {
  const tipping = ENTRIES.find((e) => e.key === '2028-tipping-point')!
  const seed = await resolveSeed(tipping)
  assert.ok(seed.outcome === 'MULTIPLE_CHOICE' && seed.otherPct === 5)
  const dem = ENTRIES.find((e) => e.key === '2028-dem-nominee')!
  await assert.rejects(() => resolveSeed(dem), /--online/)
})

test('resolved or missing sources are refused', async () => {
  const dem = ENTRIES.find((e) => e.key === '2028-dem-nominee')!
  await assert.rejects(() => resolveSeed(dem, async () => undefined), /not found/)
  await assert.rejects(
    () =>
      resolveSeed(dem, async () => ({ ...FIXTURES[SOURCES.demNominee2028], isResolved: true })),
    /resolved/
  )
})

// ------------------------------------------------------------------ payloads

test('quiet payloads are unlisted, keyed by the reserved id, images as a prefix', async () => {
  const e = ENTRIES.find((x) => x.key === '2028-dem-nominee')!
  const seed = await resolveSeed(e, reader)
  const id = reservedIdFor(SERIES, e.key)
  const p = buildPayload({
    entry: e,
    seed,
    groupIds: ['g1', 'g2'],
    reservedId: id,
    quiet: true,
    imageUrls: ['https://x/a.png', 'https://x/b.png', undefined, 'https://x/d.png'],
  })
  assert.equal(p.visibility, 'unlisted')
  assert.equal(p.idempotencyKey, id)
  assert.equal(p.outcomeType, 'MULTIPLE_CHOICE')
  assert.equal(p.addAnswersMode, 'ONLY_CREATOR')
  assert.equal(p.shouldAnswersSumToOne, true)
  assert.deepEqual(p.answerImageUrls, ['https://x/a.png', 'https://x/b.png'])
  assert.equal(p.liquidityTier, 10000)
  assert.deepEqual(p.groupIds, ['g1', 'g2'])
  assert.equal(p.closeTime, Date.parse(e.closeTime))

  const none = buildPayload({ entry: e, seed, groupIds: [], reservedId: id, quiet: false })
  assert.equal(none.visibility, 'public')
  assert.ok(!('answerImageUrls' in none))

  const bin = ENTRIES.find((x) => x.key === '2028-ec-popular-split')!
  const binSeed = await resolveSeed(bin)
  const bp = buildPayload({ entry: bin, seed: binSeed, groupIds: [], reservedId: 'x', quiet: true })
  assert.equal(bp.outcomeType, 'BINARY')
  assert.equal(bp.initialProb, 10)
})

test('opening prices are verified within 1.5 points', async () => {
  const e = ENTRIES.find((x) => x.key === '2028-house-control')!
  const seed = await resolveSeed(e)
  const ok = {
    ...market([
      { text: DEM, probability: 0.6 },
      { text: 'Republican Party', probability: 0.4 },
    ]),
  }
  assert.deepEqual(priceMismatches(seed, ok), [])
  const off = market([
    { text: DEM, probability: 0.62 },
    { text: 'Republican Party', probability: 0.38 },
  ])
  assert.equal(priceMismatches(seed, off).length, 2)
  const binSeed = await resolveSeed(ENTRIES.find((x) => x.key === '2028-ec-popular-split')!)
  assert.deepEqual(priceMismatches(binSeed, { ...ok, probability: 0.1 }), [])
  assert.equal(priceMismatches(binSeed, { ...ok, probability: 0.2 }).length, 1)
})

// ------------------------------------------------------------------ photos & dupes

test('photo registry parsing and lookup by canonical name', () => {
  const text = `export const CANDIDATE_DATA = {
  'J.D. Vance': {
    party: 'Republican',
    photo: '/political-candidates/vance.png',
    shortName: 'Vance',
  },
  "Beto O’Rourke": { party: 'Democrat', photo: '/political-candidates/orourke.png', shortName: 'O' },
  'Ron Desantis': { party: 'Republican', photo: '/political-candidates/desantis.png', shortName: 'D' },
}`
  const pairs = parsePhotoRegistry(text)
  assert.equal(pairs.length, 3)
  const index = buildPhotoIndex(pairs)
  assert.equal(photoPathFor(index, 'JD Vance'), '/political-candidates/vance.png')
  assert.equal(photoPathFor(index, 'Ron DeSantis'), '/political-candidates/desantis.png')
  assert.equal(photoPathFor(index, 'Nobody Here'), undefined)
})

test('duplicate detection needs the same years and similar wording', () => {
  const rows = [
    { id: '1', question: 'Who will be the Democratic nominee for president in 2028?', outcomeType: 'MULTIPLE_CHOICE', isResolved: false },
    { id: '2', question: 'Who will be the Democratic nominee for president in 2032?', outcomeType: 'MULTIPLE_CHOICE', isResolved: false },
    { id: '3', question: 'Will it rain in 2028?', outcomeType: 'BINARY', isResolved: false },
  ]
  const hits = similarQuestions('Who will be the 2028 Democratic presidential nominee?', rows)
  assert.deepEqual(hits.map((h) => h.m.id), ['1'])
})
