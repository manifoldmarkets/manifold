import { test } from 'node:test'
import assert from 'node:assert/strict'

import hexFile from 'web/public/data/election-house-hex.json'
import {
  availableModes,
  closestPlaces,
  describeFill,
  leaderColors,
  LEADER_COLORS,
  MapView,
  mapFills,
  OTHER_LEADER_COLOR,
  statePanel,
} from './election-map'
import { PrimaryRow } from './primaries'
import { BoardRace } from './race-board'

const view = (patch: Partial<MapView>): MapView => ({
  mode: 'president',
  president: 'ev',
  office: 'P',
  party: 'D',
  ...patch,
})

const races: BoardRace[] = [
  { o: 'P', st: 'PA', p: 0.55, s: 'pa-ev', ev: 19 },
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
  { o: 'P', st: 'WY', p: 0.02 },
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
  assert.equal(ev.WY?.kind, 'rating')
  const pv = mapFills(view({ president: 'popular' }), races, primaries)
  assert.deepEqual(Object.keys(pv), ['PA'])
  assert.equal(pv.PA.kind === 'rating' && pv.PA.p, 0.58)
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
    me[0].rows.map((r) => r.label),
    ['Electoral votes (2)', '2nd district (1 EV)']
  )
  // A prior-only row has no market, so nothing to list.
  assert.deepEqual(statePanel('WY', races, []), [])
  assert.deepEqual(
    statePanel('MN', races, primaries)[0].rows.map((r) => r.label),
    ['Democratic Senate primary (2027 special)']
  )
  assert.deepEqual(
    statePanel('CA', races, primaries)[0].rows.map((r) => r.label),
    ['Senate primary, all parties']
  )
  assert.equal(statePanel('AK', races, [])[0].rows[0].label, 'At-large')
  assert.equal(statePanel('TN', races, [])[0].rows[0].label, 'Special election')
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

test('the closest contests come first; called races are over', () => {
  const fills = mapFills(view({ mode: 'senate' }), races, primaries)
  assert.deepEqual(closestPlaces(fills), ['TN'])
  const ev = mapFills(view({}), races, primaries)
  assert.deepEqual(closestPlaces(ev, 2), ['PA', 'ME-2'])
})

test('the House cartogram has every district once', () => {
  const hexes = (hexFile as { hexes: { state: string; district: number }[] })
    .hexes
  assert.equal(hexes.length, 435)
  const keys = new Set(hexes.map((h) => `${h.state}-${h.district}`))
  assert.equal(keys.size, 435)
  // At-large districts are 0, as on the race board.
  assert.ok(keys.has('AK-0') && keys.has('WY-0'))
})
