// node:test suite for /election's compact market readings and its contents.
// From web/:
//   TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node"}' \
//     node --no-experimental-strip-types -r ts-node/register/transpile-only \
//     -r tsconfig-paths/register --test lib/politics/election-glance.test.ts

import { test } from 'node:test'
import * as assert from 'node:assert/strict'

import type { Contract } from 'common/contract'
import {
  ContentsInput,
  hasSection,
  pageContents,
  sectionWhen,
} from './election-contents'
import {
  bucketAt,
  bucketLabel,
  controlOdds,
  isBalanceOfPower,
  leadingAnswer,
  offYearRace,
  orderedBuckets,
  otherNominee,
  winnerBuckets,
  placeMore2028,
  runningField,
  sideTotal,
  yearIn,
} from './election-glance'
import { sectionOrder } from './election-phase'
import { settledOrPrice } from './settlement'

const at = (y: number, m: number, d: number, h = 12) => Date.UTC(y, m - 1, d, h)
const answers = (pairs: [string, number][]) =>
  pairs.map(([text, p], i) => ({ id: `a${i}`, text, p }))
const close = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`)

// ------------------------------------------------------------------ buckets

test('buckets read in scale order, Democrats positive', () => {
  assert.equal(bucketAt('Under 200'), 199.5)
  assert.equal(bucketAt('230–269'), 249.5)
  assert.equal(bucketAt('230-269'), 249.5)
  assert.equal(bucketAt('360 or more'), 360.5)
  assert.equal(bucketAt('R+6 or more'), -6.5)
  assert.equal(bucketAt('R+0 to R+3'), -1.5)
  assert.equal(bucketAt('D+0 to D+3'), 1.5)
  assert.equal(bucketAt('D+9 or more'), 9.5)
  assert.equal(bucketAt('Other'), undefined)
  assert.equal(bucketAt('Jon Ossoff'), undefined)
  assert.equal(bucketLabel('Under 200'), '<200')
  assert.equal(bucketLabel('360 or more'), '360+')
  assert.equal(bucketLabel('R+3 to R+6'), 'R+3–6')
  assert.equal(bucketLabel('D+9 or more'), 'D+9+')
  assert.equal(bucketLabel('230–269'), '230–269')
})

test('the electoral-vote market splits at 270', () => {
  const b = orderedBuckets(
    answers([
      ['230–269', 0.194],
      ['270–299', 0.194],
      ['300–329', 0.189],
      ['360 or more', 0.145],
      ['330–359', 0.144],
      ['200–229', 0.08],
      ['Under 200', 0.054],
    ]),
    270
  )!
  assert.deepEqual(
    b.map((x) => x.label),
    ['<200', '200–229', '230–269', '270–299', '300–329', '330–359', '360+']
  )
  assert.deepEqual(
    b.map((x) => x.side),
    ['R', 'R', 'R', 'D', 'D', 'D', 'D']
  )
  close(sideTotal(b, 'D'), 0.672)
})

test("the Republican's electoral votes: 538 minus the Democrat's, the line at 269", () => {
  const dem = orderedBuckets(
    answers([
      ['230–269', 0.194],
      ['270–299', 0.194],
      ['300–329', 0.189],
      ['360 or more', 0.145],
      ['330–359', 0.144],
      ['200–229', 0.08],
      ['Under 200', 0.054],
    ]),
    270
  )!
  const rep = otherNominee(dem, 538, 269)!
  assert.deepEqual(
    rep.map((x) => x.label),
    ['<179', '179–208', '209–238', '239–268', '269–308', '309–338', '339+']
  )
  assert.deepEqual(
    rep.map((x) => x.side),
    ['D', 'D', 'D', 'D', 'R', 'R', 'R']
  )
  // Each range keeps its answer and chance: 339+ is the Democrat's Under 200.
  assert.equal(rep[6].id, dem[0].id)
  assert.equal(rep[6].p, 0.054)
  // 269 or more (a win or a tie) is the Democrat at 269 or fewer.
  close(sideTotal(rep, 'R'), 0.054 + 0.08 + 0.194)
  close(sideTotal(rep, 'R') + sideTotal(dem, 'D'), 1)
  // A market it can't read as counts isn't flipped.
  const margin = orderedBuckets(
    answers([
      ['D+0 to D+3', 0.5],
      ['R+0 to R+3', 0.5],
    ]),
    0
  )!
  assert.equal(otherNominee(margin, 538, 269), undefined)
})

test("electoral votes from the winner's side: Democrat landslide to Republican landslide", () => {
  const dem = orderedBuckets(
    answers([
      ['230–269', 0.194],
      ['270–299', 0.194],
      ['300–329', 0.189],
      ['360 or more', 0.145],
      ['330–359', 0.144],
      ['200–229', 0.08],
      ['Under 200', 0.054],
    ]),
    270
  )!
  const w = winnerBuckets(dem, 538, 270)!
  // The Democrat's counts from the most, then the Republican's from the
  // closest: the Democrat's 230–269 is the Republican's 269–308 (a tie in).
  assert.deepEqual(
    w.map((x) => x.label),
    ['360+', '330–359', '300–329', '270–299', '269–308', '309–338', '339+']
  )
  assert.deepEqual(
    w.map((x) => x.text),
    [
      '360 or more',
      '330–359',
      '300–329',
      '270–299',
      '269–308',
      '309–338',
      '339 or more',
    ]
  )
  assert.deepEqual(
    w.map((x) => x.side),
    ['D', 'D', 'D', 'D', 'R', 'R', 'R']
  )
  // Each keeps its answer and chance: the Republican's 339+ is the
  // Democrat's Under 200.
  assert.equal(w[6].id, dem[0].id)
  assert.equal(w[6].p, 0.054)
  close(sideTotal(w, 'D'), sideTotal(dem, 'D'))
  close(sideTotal(w, 'D') + sideTotal(w, 'R'), 1)
  // A range across the line has no winner's side.
  const across = orderedBuckets(
    answers([
      ['Under 260', 0.5],
      ['260–289', 0.3],
      ['290 or more', 0.2],
    ]),
    270
  )!
  assert.equal(winnerBuckets(across, 538, 270), undefined)
  // Nor does a market that isn't counts.
  const margin = orderedBuckets(
    answers([
      ['D+0 to D+3', 0.5],
      ['R+0 to R+3', 0.5],
    ]),
    0
  )!
  assert.equal(winnerBuckets(margin, 538, 270), undefined)
})

// The seat-count markets' answers, as the national script makes them.
const SENATE = answers([
  ['Under 44', 0.01],
  ['44–46', 0.019],
  ['47–49', 0.059],
  ['50', 0.035],
  ['51–53', 0.161],
  ['54–56', 0.226],
  ['57–59', 0.223],
  ['60–62', 0.156],
  ['63 or more', 0.111],
])

test('Senate seats: 50 is a tie, on neither side; the line at 51', () => {
  assert.equal(bucketAt('50'), 50)
  assert.equal(bucketLabel('50'), '50')
  const dem = orderedBuckets(SENATE, 51, 50)!
  assert.deepEqual(
    dem.map((x) => x.label),
    ['<44', '44–46', '47–49', '50', '51–53', '54–56', '57–59', '60–62', '63+']
  )
  assert.deepEqual(
    dem.map((x) => x.side),
    ['R', 'R', 'R', 'tie', 'D', 'D', 'D', 'D', 'D']
  )
  close(sideTotal(dem, 'D'), 0.161 + 0.226 + 0.223 + 0.156 + 0.111)
  close(sideTotal(dem, 'tie'), 0.035)
  // From the Republican side: 100 minus each range, 50 still the tie.
  const rep = otherNominee(dem, 100, 51, 50)!
  assert.deepEqual(
    rep.map((x) => x.label),
    ['<38', '38–40', '41–43', '44–46', '47–49', '50', '51–53', '54–56', '57+']
  )
  assert.deepEqual(
    rep.map((x) => x.side),
    ['D', 'D', 'D', 'D', 'D', 'tie', 'R', 'R', 'R']
  )
  assert.equal(rep[5].id, dem[3].id)
  // Republicans at 51 or more is Democrats at 49 or fewer.
  close(sideTotal(rep, 'R'), 0.01 + 0.019 + 0.059)
  close(sideTotal(rep, 'R') + sideTotal(rep, 'tie') + sideTotal(dem, 'D'), 1)
})

test('a resolved seat count reads by its result, not its last prices', () => {
  // Resolved to "Under 44"; the prices still say 54–56 at 80%.
  const market = {
    isResolved: true,
    resolution: 'a0',
    answers: SENATE.map((a) => ({ id: a.id })),
  }
  const price = (id: string) => (id === 'a5' ? 0.8 : 0.025)
  const read = SENATE.map((a) => ({
    ...a,
    p: settledOrPrice(market, a.id, price),
  }))
  const b = orderedBuckets(read, 51, 50)!
  close(sideTotal(b, 'D'), 0)
  close(sideTotal(b, 'R'), 1)
  // A split by its recorded shares; an open market by price.
  const split = {
    ...market,
    resolution: 'CHOOSE_MULTIPLE',
    resolutions: { a4: 60, a5: 40 },
  }
  close(settledOrPrice(split, 'a5', price), 0.4)
  close(settledOrPrice({ ...market, isResolved: false }, 'a5', price), 0.8)
})

test('House seats read the same from either side', () => {
  const dem = orderedBuckets(
    answers([
      ['Under 193', 0.01],
      ['193–202', 0.027],
      ['203–212', 0.087],
      ['213–217', 0.08],
      ['218–222', 0.105],
      ['223–232', 0.256],
      ['233–242', 0.231],
      ['243 or more', 0.204],
    ]),
    218
  )!
  assert.deepEqual(
    dem.map((x) => x.side),
    ['R', 'R', 'R', 'R', 'D', 'D', 'D', 'D']
  )
  const rep = otherNominee(dem, 435, 218)!
  // The ranges are symmetric about 217.5, so the labels come back the same.
  assert.deepEqual(
    rep.map((x) => x.label),
    dem.map((x) => x.label)
  )
  assert.deepEqual(
    rep.map((x) => x.side),
    ['D', 'D', 'D', 'D', 'R', 'R', 'R', 'R']
  )
  // Republicans' 218–222 is the Democrats' 213–217.
  assert.equal(rep[4].id, dem[3].id)
  close(sideTotal(rep, 'R') + sideTotal(dem, 'D'), 1)
})

test('the margin market splits at an even vote; Other is dropped', () => {
  const b = orderedBuckets(
    answers([
      ['D+3 to D+6', 0.249],
      ['R+0 to R+3', 0.073],
      ['R+6 or more', 0.01],
      ['D+0 to D+3', 0.168],
      ['Other', 0.02],
    ]),
    0
  )!
  assert.deepEqual(
    b.map((x) => x.text),
    ['R+6 or more', 'R+0 to R+3', 'D+0 to D+3', 'D+3 to D+6']
  )
  assert.deepEqual(
    b.map((x) => x.side),
    ['R', 'R', 'D', 'D']
  )
})

test("a market that isn't all ranges isn't a strip", () => {
  assert.equal(
    orderedBuckets(
      answers([
        ['230–269', 0.5],
        ['Kamala Harris', 0.5],
      ]),
      270
    ),
    undefined
  )
  assert.equal(orderedBuckets(answers([['230–269', 1]]), 270), undefined)
})

// ---------------------------------------------------------- balance of power

const BOP = answers([
  ['D President, D Senate, D House (Democratic trifecta)', 0.344],
  ['R President, R Senate, R House (Republican trifecta)', 0.244],
  ['D President, D Senate, R House', 0.093],
  ['R President, D Senate, R House', 0.076],
  ['D President, R Senate, D House', 0.075],
  ['D President, R Senate, R House', 0.056],
  ['R President, D Senate, D House', 0.056],
  ['R President, R Senate, D House', 0.056],
])

test("each office's Democratic chance sums the combinations", () => {
  const odds = controlOdds(BOP)!
  close(odds.president, 0.344 + 0.093 + 0.075 + 0.056)
  close(odds.senate, 0.344 + 0.093 + 0.076 + 0.056)
  close(odds.house, 0.344 + 0.075 + 0.056 + 0.056)
  assert.ok(isBalanceOfPower(BOP))
  // Normalized over what was read, so a drift off 100% doesn't skew it.
  const half = controlOdds(
    answers([
      ['D President, D Senate, D House', 0.3],
      ['R President, R Senate, R House', 0.3],
      ['Other', 0.4],
    ])
  )!
  close(half.president, 0.5)
  assert.equal(controlOdds(answers([['Yes', 1]])), undefined)
  assert.ok(!isBalanceOfPower(answers([['Democratic Party', 0.6]])))
})

// ------------------------------------------------------------- off-year

test('off-year races read state, office and year from the question', () => {
  assert.deepEqual(
    offYearRace('Which party will win the 2027 Kentucky governor election?'),
    { state: 'KY', office: 'Governor', rank: 0, cycle: 2027 }
  )
  assert.deepEqual(
    offYearRace(
      'Which Party will win the 2027 Kentucky Gubernatorial Election?'
    ),
    { state: 'KY', office: 'Governor', rank: 0, cycle: 2027 }
  )
  assert.equal(
    offYearRace(
      'Which party will control the Virginia House of Delegates after the 2029 election?'
    )?.office,
    'House of Delegates'
  )
  assert.equal(
    offYearRace(
      'Which party will control the New Jersey General Assembly after the 2027 election?'
    )?.office,
    'Assembly'
  )
  assert.equal(
    offYearRace(
      'Which party will control the Louisiana Senate after the 2027 election?'
    )?.office,
    'Senate'
  )
  assert.deepEqual(
    offYearRace(
      'Which party will win the 2027 U.S. Senate special election in Minnesota?'
    ),
    { state: 'MN', office: 'U.S. Senate special', rank: 1, cycle: 2027 }
  )
  // Not one state's race in an odd year.
  assert.equal(
    offYearRace('Who will win the January 2027 Speaker of the House election?'),
    undefined
  )
  assert.equal(
    offYearRace('Who will win the 2027 Chicago mayoral election?'),
    undefined
  )
  assert.equal(
    offYearRace('Which party will win the 2028 Kentucky Senate election?'),
    undefined
  )
})

test('the leading answer skips Other', () => {
  assert.equal(
    leadingAnswer(
      answers([
        ['Other', 0.5],
        ['Alexandria Ocasio-Cortez', 0.079],
        ['Marco Rubio', 0.077],
      ])
    )?.text,
    'Alexandria Ocasio-Cortez'
  )
  assert.equal(leadingAnswer(answers([['Other', 1]])), undefined)
})

test("the primaries' field markets are the who-will-run ones", () => {
  assert.equal(
    runningField(
      'Who will run for the Democratic presidential nomination in 2028?'
    ),
    'D'
  )
  assert.equal(
    runningField(
      'Who will run for the Republican presidential nomination in 2028?'
    ),
    'R'
  )
  assert.equal(
    runningField(
      'Who will win the 2028 Iowa Republican presidential caucuses?'
    ),
    undefined
  )
  // "run" inside another word isn't the field.
  assert.equal(
    runningField('Who will be the Democratic frontrunner in 2028?'),
    undefined
  )
  assert.equal(
    yearIn('Who will win the January 2027 Speaker of the House election?'),
    2027
  )
  assert.equal(yearIn('Will a House seat flip?'), undefined)
})

test('2028 markets without a slot go where they belong', () => {
  assert.equal(placeMore2028('2028-dem-contested-convention'), 'conventions')
  assert.equal(placeMore2028('2028-vp-winner'), 'conventions')
  assert.equal(placeMore2028('2028-npvic-in-effect'), 'facts')
  // A market a script adds later still shows.
  assert.equal(placeMore2028('2028-something-new'), 'facts')
  assert.equal(placeMore2028(undefined), 'facts')
})

// ------------------------------------------------------------- contents

const c = (id: string) => ({ id } as unknown as Contract)

const input = (over: Partial<ContentsInput> = {}): ContentsInput => ({
  now: at(2026, 11, 8),
  phase: 'nomination',
  accuracy: { beatRealMoney: true, chambers: [] },
  leaderboards: [],
  partyContract: null,
  charts: [],
  board2028: [],
  primaries: [],
  primaryContracts: [],
  balanceOfPowerContract: null,
  congressContract: null,
  popularVoteContract: null,
  more2028: [],
  marketKeys: {},
  demVpContract: null,
  gopVpContract: null,
  ticketContract: null,
  offYear: [],
  before2028World: [],
  later: [],
  board2030: [],
  balanceOfPower2030: null,
  seats2030: { senate: null, house: null },
  national2028: {
    margin: null,
    electoralVotes: null,
    tippingPoint: null,
    senateSeats: null,
    houseSeats: null,
  },
  presidencyMatrixRows: [],
  pollingPerpContracts: [],
  unprecedentedContracts: [],
  trendingContracts: [],
  swings: [],
  ...over,
})

test('the 2030 section shows with only its seat counts', () => {
  const p = input({ phase: 'midterms2030', now: at(2029, 6, 1) })
  assert.equal(hasSection(p, 'midterms2030'), false)
  assert.equal(
    hasSection(
      { ...p, seats2030: { senate: c('s'), house: null } },
      'midterms2030'
    ),
    true
  )
})

test('the national section keeps a 2028 result display after its market closes', () => {
  // The loader keeps these slots whether or not the market is open, so the
  // results phase still has its seat count.
  const p = input({ phase: 'results', now: at(2028, 11, 20) })
  assert.equal(hasSection(p, 'national'), false)
  const seats = { ...p.national2028, senateSeats: c('s') }
  assert.equal(hasSection({ ...p, national2028: seats }, 'national'), true)
})

test('the contents lists only what the page shows, in page order', () => {
  const empty = pageContents(input())
  assert.deepEqual(
    empty.map((e) => e.key),
    ['feed']
  )
  const full = pageContents(
    input({
      partyContract: c('party'),
      board2028: [{} as ContentsInput['board2028'][number]],
      popularVoteContract: c('pv'),
      offYear: [c('ky')],
      later: [c('2030')],
      unprecedentedContracts: [c('u')],
    })
  )
  assert.deepEqual(
    full.map((e) => e.key),
    ['race', 'map', 'national', 'offYear', 'later', 'unprecedented', 'feed']
  )
  // Ordered as the page is.
  const order = sectionOrder('nomination')
  for (let i = 1; i < full.length; i++)
    assert.ok(order.indexOf(full[i - 1].key) < order.indexOf(full[i].key))
  assert.deepEqual(
    full.map((e) => e.id),
    ['race', 'map', 'national', 'off-year', 'later', 'unprecedented', 'feed']
  )
  // The leaderboards are a section of their own, last before the feed.
  const boards = pageContents(
    input({
      leaderboards: [{ key: '2026' } as ContentsInput['leaderboards'][number]],
      swings: [{} as ContentsInput['swings'][number]],
    })
  )
  assert.deepEqual(
    boards.map((e) => e.key),
    ['swings2026', 'leaderboards', 'feed']
  )
  assert.equal(boards[1].label, 'Leaderboards')
  assert.equal(boards[1].id, 'leaderboards')
})

test('a convention market brings the conventions chapter, not the national one', () => {
  const p = input({
    more2028: [c('conv')],
    marketKeys: { conv: '2028-dem-contested-convention' },
  })
  assert.ok(hasSection(p, 'runningMates'))
  assert.ok(!hasSection(p, 'national'))
  const q = input({
    more2028: [c('ev')],
    marketKeys: { ev: '2028-dem-electoral-votes' },
  })
  assert.ok(hasSection(q, 'national'))
  assert.ok(!hasSection(q, 'runningMates'))
})

test('dated sections count down, and the off-year date moves to 2029', () => {
  const now = at(2026, 11, 8)
  assert.equal(sectionWhen('map', now, 'nomination'), 'Nov 7, 2028 · 730 days')
  assert.equal(
    sectionWhen('offYear', now, 'nomination'),
    'Nov 2, 2027 · 359 days'
  )
  assert.match(
    sectionWhen('offYear', at(2028, 1, 10), 'primaries')!,
    /^Nov 6, 2029 · /
  )
  assert.equal(sectionWhen('primaries', now, 'nomination'), 'January–June 2028')
  assert.equal(
    sectionWhen('primaries', at(2028, 2, 1), 'primaries'),
    'Under way'
  )
  assert.equal(sectionWhen('race', now, 'nomination'), undefined)
  // Past dates lose the count.
  assert.equal(sectionWhen('board', at(2028, 12, 1), 'results'), 'Nov 7, 2028')
})
