import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  availableModes,
  describeFill,
  focusRowKey,
  leaderColors,
  leaderOf,
  LEADER_COLORS,
  MapView,
  mapFills,
  mapTracker,
  matchesPlace,
  OTHER_LEADER_COLOR,
  placeTitle,
  SENATE_NOT_UP_2028,
  statePanel,
  tippingPlaces,
} from './election-map'
import { PrimaryRow } from './primaries'
import { BoardRace } from './race-board'

const view = (patch: Partial<MapView>): MapView => ({
  mode: 'president',
  office: 'P',
  party: 'D',
  ...patch,
})

const races: BoardRace[] = [
  { o: 'P', st: 'PA', p: 0.55, s: 'pa-ev', ev: 19 },
  { o: 'P', st: 'TX', p: 0.2, s: 'tx-ev', ev: 40 },
  { o: 'P', st: 'CA', p: 0.97, s: 'ca-ev', ev: 54 },
  { o: 'P', st: 'GA', p: 0.502, s: 'ga-ev', ev: 16 },
  { o: 'P', st: 'ME', p: 0.8, s: 'me-ev', ev: 2 },
  { o: 'P', st: 'ME', d: 2, p: 0.3, s: 'me2-ev', ev: 1 },
  { o: 'V', st: 'PA', p: 0.58, s: 'pa-pv' },
  { o: 'S', st: 'TN', sp: 1, p: 0.1, s: 'tn-sp' },
  { o: 'S', st: 'PA', p: 0.62, s: 'pa-sen', c: 'D' },
  { o: 'G', st: 'NH', p: 0.45, s: 'nh-gov' },
  { o: 'H', st: 'PA', d: 1, p: 0.4, s: 'pa-1' },
  { o: 'H', st: 'PA', d: 12, p: 0.9, s: 'pa-12' },
  { o: 'H', st: 'AK', d: 0, p: 0.2, s: 'ak-al' },
  // A row reading only its prior has no market to list.
  { o: 'P', st: 'WY', p: 0.02, ev: 3 },
]

const cell = (l: string, p: number, s = `${l}-mkt`) => ({ s, l, p })
const primaries: PrimaryRow[] = [
  {
    k: 'P-IA-2028',
    o: 'P',
    st: 'IA',
    D: cell('Newsom', 0.4),
    R: cell('Vance', 0.6),
  },
  { k: 'P-NH-2028', o: 'P', st: 'NH', D: cell('Buttigieg', 0.35) },
  { k: 'P-PA-2028', o: 'P', st: 'PA', D: cell('Shapiro', 0.7) },
  { k: 'P-SC-2028', o: 'P', st: 'SC', D: cell('Newsom', 0.3) },
  { k: 'P-NV-2028', o: 'P', st: 'NV', D: cell('Whitmer', 0.25) },
  { k: 'P-PR-2028', o: 'P', st: 'PR', D: cell('Newsom', 0.5) },
  {
    k: 'S-PA-2028',
    o: 'S',
    st: 'PA',
    D: cell('Fetterman', 0.95),
    R: cell('Mc', 0.5),
  },
  { k: 'S-CA-2028', o: 'S', st: 'CA', A: cell('Padilla', 0.8) },
  {
    k: 'S-MN-sp-2027',
    o: 'S',
    st: 'MN',
    sp: 1,
    y: 2027,
    D: cell('Flanagan', 0.7),
  },
]

test('the President view colors states and Maine/Nebraska districts', () => {
  const ev = mapFills(view({}), races, primaries)
  assert.deepEqual(ev.PA, { kind: 'rating', p: 0.55 })
  assert.deepEqual(ev['ME-2'], { kind: 'rating', p: 0.3 })
  assert.equal(ev.ME?.kind, 'rating')
  assert.equal(ev.WY?.kind, 'rating')
  // The state popular-vote markets aren't map colors.
  assert.ok(Object.values(ev).every((f) => f.kind === 'rating' && f.p !== 0.58))
})

test('Senate, governor and House views', () => {
  const senate = mapFills(view({ mode: 'senate' }), races, primaries)
  assert.deepEqual(senate.PA, { kind: 'rating', p: 0.62, c: 'D' })
  assert.equal(senate.TN?.kind, 'rating')
  assert.deepEqual(
    Object.keys(mapFills(view({ mode: 'governor' }), races, primaries)),
    ['NH']
  )
  const house = mapFills(view({ mode: 'house' }), races, primaries)
  assert.deepEqual(Object.keys(house).sort(), ['AK-0', 'PA-1', 'PA-12'])
})

test('presidential primaries color by leader, the three most common first', () => {
  const colors = leaderColors(primaries, 'D')
  // Newsom leads 3, then the rest lead 1 each, by name.
  assert.deepEqual(colors, {
    Newsom: LEADER_COLORS[0],
    Buttigieg: LEADER_COLORS[1],
    Shapiro: LEADER_COLORS[2],
  })
  const fills = mapFills(view({ mode: 'primary' }), races, primaries)
  assert.equal(fills.IA.kind === 'leader' && fills.IA.color, LEADER_COLORS[0])
  assert.equal(fills.NV.kind === 'leader' && fills.NV.color, OTHER_LEADER_COLOR)
  // Territories are on the map too (as chips).
  assert.equal(fills.PR?.kind, 'leader')
  const gop = mapFills(view({ mode: 'primary', party: 'R' }), races, primaries)
  assert.deepEqual(Object.keys(gop), ['IA'])
})

test('Senate and governor primaries: a party contest, else the open one', () => {
  const d = mapFills(
    view({ mode: 'primary', office: 'S', party: 'D' }),
    races,
    primaries
  )
  assert.deepEqual(d.PA, {
    kind: 'strength',
    party: 'D',
    name: 'Fetterman',
    p: 0.95,
    won: false,
  })
  assert.equal(d.CA.kind, 'open')
  assert.equal(d.MN.kind, 'strength')
  const r = mapFills(
    view({ mode: 'primary', office: 'S', party: 'R' }),
    races,
    primaries
  )
  assert.equal(r.CA.kind, 'open')
  assert.equal(r.MN, undefined)
})

test('modes appear only with something to show', () => {
  assert.deepEqual(availableModes(races, primaries), [
    'president',
    'senate',
    'governor',
    'house',
    'primary',
  ])
  assert.deepEqual(
    availableModes(
      races.filter((r) => r.o === 'P'),
      []
    ),
    ['president']
  )
})

test('a race leads by the odds readers see: 50.2% is even', () => {
  assert.equal(leaderOf({ p: 0.55 }), 'D')
  assert.equal(leaderOf({ p: 0.45 }), 'R')
  assert.equal(leaderOf({ p: 0.502 }), undefined)
  assert.equal(leaderOf({ p: 0.3, c: 'D' }), 'D')
  assert.equal(leaderOf({ p: 0.9, c: 'O' }), undefined)
})

test('the President tracker counts electoral votes by rating, to 270', () => {
  const t = mapTracker(view({}), races, primaries)
  assert.equal(t.threshold, 270)
  // CA 54 + PA 19 + ME 2 lead D; TX 40 + ME-2 1 + WY 3 lead R; GA is even.
  assert.equal(t.dem, 75)
  assert.equal(t.rep, 44)
  assert.deepEqual(
    t.segments.map((s) => [s.key, s.count, s.places]),
    [
      ['safeD', 54, ['CA']],
      ['likelyD', 2, ['ME']],
      ['tossup', 35, ['PA', 'GA']],
      ['leanR', 1, ['ME-2']],
      ['likelyR', 40, ['TX']],
      ['safeR', 3, ['WY']],
    ]
  )
  // Every electoral vote on the board is in a segment.
  assert.equal(
    t.segments.reduce((n, s) => n + s.count, 0),
    54 + 19 + 40 + 16 + 2 + 1 + 3
  )
})

test('the Senate tracker adds the seats not up in 2028, to 100', () => {
  const t = mapTracker(view({ mode: 'senate' }), races, primaries)
  assert.equal(SENATE_NOT_UP_2028.D + SENATE_NOT_UP_2028.R, 65)
  assert.equal(t.threshold, 50)
  // PA called for D; TN's special leans hard R.
  assert.equal(t.dem, SENATE_NOT_UP_2028.D + 1)
  assert.equal(t.rep, SENATE_NOT_UP_2028.R + 1)
  assert.deepEqual(
    t.segments.map((s) => s.key),
    ['notUpD', 'wonD', 'safeR', 'notUpR']
  )
  assert.deepEqual(t.segments[0].places, [])
})

test('House and governor trackers', () => {
  const house = mapTracker(view({ mode: 'house' }), races, primaries)
  assert.equal(house.threshold, 218)
  assert.equal(house.dem, 1)
  assert.equal(house.rep, 2)
  assert.equal(house.middle, '218 for a majority · 3 seats')
  const gov = mapTracker(view({ mode: 'governor' }), races, primaries)
  assert.equal(gov.threshold, undefined)
  assert.equal(gov.middle, '1 governorships up in 2028')
})

test('primary trackers count contests by leader or by how sure', () => {
  const p = mapTracker(view({ mode: 'primary' }), races, primaries)
  assert.equal(p.dem, undefined)
  assert.deepEqual(
    p.segments.map((s) => [s.label, s.count, s.color]),
    [
      ['Newsom leads', 3, LEADER_COLORS[0]],
      ['Buttigieg leads', 1, LEADER_COLORS[1]],
      ['Shapiro leads', 1, LEADER_COLORS[2]],
      ['Someone else leads', 1, OTHER_LEADER_COLOR],
    ]
  )
  const s = mapTracker(
    view({ mode: 'primary', office: 'S' }),
    races,
    primaries
  )
  assert.deepEqual(
    s.segments.map((x) => [x.key, x.places]),
    [
      ['strength2', ['PA']],
      ['strength1', ['MN']],
      ['open', ['CA']],
    ]
  )
})

test('tipping points: the likeliest few, above a floor', () => {
  const tips = [
    { key: 'PA', p: 0.22 },
    { key: 'MI', p: 0.15 },
    { key: 'WI', p: 0.1 },
    { key: 'NE-2', p: 0.02 },
  ]
  assert.deepEqual(
    tippingPlaces(tips).map((t) => t.key),
    ['PA', 'MI', 'WI']
  )
  assert.deepEqual(
    tippingPlaces(tips, 2).map((t) => t.key),
    ['PA', 'MI']
  )
})

test('search finds states, names and districts', () => {
  assert.ok(matchesPlace('PA', 'pa'))
  assert.ok(matchesPlace('PA', 'penn'))
  assert.ok(matchesPlace('PA-1', 'Pennsylvania'))
  assert.ok(matchesPlace('TX-15', 'TX-15'))
  assert.ok(matchesPlace('TX-15', 'tx 15'))
  assert.ok(!matchesPlace('TX-1', 'TX-15'))
  assert.ok(matchesPlace('AK-0', 'ak-al'))
  assert.ok(matchesPlace('PR', 'puerto'))
  // "Virginia" also names West Virginia; a code is exact.
  assert.ok(matchesPlace('WV', 'virginia'))
  assert.ok(!matchesPlace('WV', 'va'))
  assert.ok(matchesPlace('OH', 'pa, oh'))
  assert.ok(!matchesPlace('PA', 'p'))
})

test("a state's panel lists every market it has, by office", () => {
  const pa = statePanel('PA', races, primaries, [
    {
      question: 'Who will win the 2027 Pennsylvania Supreme Court retention?',
      slug: 'pa-court',
      creatorUsername: 'Someone',
    },
    {
      question: 'Who will be elected governor of Kentucky in 2027?',
      slug: 'ky',
      creatorUsername: 'ManifoldPolitics',
    },
  ])
  assert.deepEqual(
    pa.map((s) => [s.key, s.rows.map((r) => r.label)]),
    [
      ['president', ['Electoral votes (19)', 'Popular vote']],
      ['senate', ['Senate']],
      ['house', ['1st district', '12th district']],
      [
        'primaries',
        [
          'Democratic presidential primary',
          'Democratic Senate primary',
          'Republican Senate primary',
        ],
      ],
      ['more', ['Who will win the 2027 Pennsylvania Supreme Court retention?']],
    ]
  )
  const me = statePanel('ME', races, [])
  assert.deepEqual(
    me[0].rows.map((r) => [r.key, r.label]),
    [
      ['P-ME', 'Statewide (2)'],
      ['P-ME-2', '2nd district (1 EV)'],
    ]
  )
  // A prior-only row has no market, so nothing to list.
  assert.deepEqual(statePanel('WY', races, []), [])
  assert.deepEqual(
    statePanel('MN', races, primaries)[0].rows.map((r) => r.label),
    ['Democratic Senate primary (2027 special)']
  )
  assert.deepEqual(
    statePanel('CA', races, primaries)
      .find((s) => s.key === 'primaries')
      ?.rows.map((r) => r.label),
    ['Senate primary, all parties']
  )
  assert.equal(
    statePanel('AK', races, [])[0].rows[0].label,
    'At-large'
  )
  assert.equal(
    statePanel('TN', races, [])[0].rows[0].label,
    'Special election'
  )
})

test('a clicked place opens the race behind its color', () => {
  assert.equal(focusRowKey(view({}), 'PA'), 'P-PA')
  assert.equal(focusRowKey(view({}), 'ME-2'), 'P-ME-2')
  assert.equal(focusRowKey(view({ mode: 'senate' }), 'PA'), 'S-PA')
  assert.equal(focusRowKey(view({ mode: 'house' }), 'PA-12'), 'H-PA-12')
  assert.equal(focusRowKey(view({ mode: 'house' }), 'AK-0'), 'H-AK-0')
  // Its keys are the panel's.
  const rows = statePanel('PA', races, primaries).flatMap((s) => s.rows)
  assert.ok(rows.some((r) => r.key === 'H-PA-12'))
  assert.ok(rows.some((r) => r.key === 'S-PA'))
})

test('places are named for people', () => {
  assert.equal(placeTitle('PA'), 'Pennsylvania')
  assert.equal(placeTitle('PA-1'), "Pennsylvania's 1st district")
  assert.equal(placeTitle('NY-12'), "New York's 12th district")
  assert.equal(placeTitle('AK-0'), 'Alaska at-large')
  assert.equal(placeTitle('ME', true), 'Maine statewide')
  assert.equal(placeTitle('PR'), 'Puerto Rico')
  assert.equal(placeTitle('DA'), 'Democrats Abroad')
})

test('fills read as odds, leaders and calls', () => {
  assert.equal(describeFill({ kind: 'rating', p: 0.64 }), 'D 64%')
  assert.equal(describeFill({ kind: 'rating', p: 0.2 }), 'R 80%')
  assert.equal(describeFill({ kind: 'rating', p: 0.999 }), 'D >99%')
  assert.equal(describeFill({ kind: 'rating', p: 0.7, c: 'R' }), 'Called for R')
  assert.equal(
    describeFill({ kind: 'open', name: 'Padilla', p: 0.8 }),
    'Padilla 80%'
  )
  assert.equal(
    describeFill({ kind: 'open', name: 'Padilla', p: 1, won: true }),
    'Won: Padilla'
  )
  assert.equal(describeFill({ kind: 'open' }), 'No leader yet')
})
