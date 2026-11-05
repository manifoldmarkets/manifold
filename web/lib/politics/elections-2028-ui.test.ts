// node:test suite for the 2028+ page's calendar, race board, primaries and
// official-market wiring. From web/:
//   TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node"}' \
//     node --no-experimental-strip-types -r ts-node/register/transpile-only \
//     -r tsconfig-paths/register --test lib/politics/elections-2028-ui.test.ts

import { test } from 'node:test'
import * as assert from 'node:assert/strict'

import mapping from 'web/public/data/election-markets-2028.json'
import {
  electionPhase,
  PHASE_STARTS,
  sectionOrder,
  showsSection,
} from './election-phase'
import { upcomingTimeline } from './elections-2028-config'
import { ELECTORAL_UNITS } from './ec-model'
import {
  classifyNational,
  classifyPipeline,
  OfficialMarketsFile,
  pickSlot,
  placeIn,
} from './official-markets'
import { orderPrimaryRows, pickLeader, PrimaryRow } from './primaries'
import {
  boardColumn,
  BoardRace,
  calledFrom,
  calledTotals,
  columnOf,
  columnTotals,
  flipped,
  groupRaces,
  raceId,
  raceLabel,
  raceName,
  raceUrl,
} from './race-board'

const at = (y: number, m: number, d: number, h = 12) => Date.UTC(y, m - 1, d, h)

// ------------------------------------------------------------------ phases

test('the phase follows the calendar', () => {
  assert.equal(electionPhase(at(2026, 11, 6)), 'nomination')
  assert.equal(electionPhase(at(2027, 12, 31)), 'nomination')
  assert.equal(electionPhase(at(2028, 1, 1, 0)), 'primaries')
  assert.equal(electionPhase(at(2028, 6, 30)), 'primaries')
  assert.equal(electionPhase(at(2028, 7, 1, 0)), 'conventions')
  assert.equal(electionPhase(at(2028, 9, 1, 0)), 'general')
  // Election Day morning: the first polls open at 6am ET (11:00 UTC).
  assert.equal(electionPhase(PHASE_STARTS.results - 1), 'general')
  assert.equal(electionPhase(PHASE_STARTS.results), 'results')
  assert.equal(electionPhase(at(2029, 1, 20, 16)), 'results')
  assert.equal(electionPhase(at(2029, 1, 20, 18)), 'midterms2030')
  assert.equal(electionPhase(at(2030, 11, 4)), 'midterms2030')
})

test('each phase orders its sections once, ending with the feed', () => {
  for (const phase of [
    'nomination',
    'primaries',
    'conventions',
    'general',
    'results',
    'midterms2030',
  ] as const) {
    const order = sectionOrder(phase)
    assert.equal(new Set(order).size, order.length, phase)
    assert.equal(order[order.length - 1], 'feed', phase)
  }
  assert.equal(sectionOrder('nomination')[0], 'accuracy')
  assert.equal(sectionOrder('primaries')[1], 'primaries')
  assert.equal(sectionOrder('results')[0], 'board')
  assert.equal(sectionOrder('midterms2030')[1], 'midterms2030')
  // Data is only loaded where it shows.
  assert.ok(!showsSection('nomination', 'midterms2030'))
  assert.ok(showsSection('nomination', 'primaries'))
  assert.ok(!showsSection('general', 'primaries'))
  assert.ok(!showsSection('results', 'swings2026'))
})

test('the timeline drops what is over and keeps seasons undated', () => {
  const now = upcomingTimeline(at(2026, 11, 6))
  assert.equal(now[0].key, '2027')
  assert.deepEqual(
    now.slice(0, 4).map((e) => e.key),
    ['2027', 'early', 'super-tuesday', 'last-primaries']
  )
  const early = now.find((e) => e.key === 'early')!
  assert.equal(early.time, undefined)
  assert.equal(early.season, 'Early 2028')
  const march = upcomingTimeline(at(2028, 3, 2))
  assert.equal(march[0].key, 'super-tuesday')
  assert.ok(!march.some((e) => e.key === 'early'))
  assert.equal(upcomingTimeline(at(2029, 1, 22))[0].key, '2029')
})

// ------------------------------------------------------------------ board

const race = (over: Partial<BoardRace>): BoardRace => ({
  o: 'S',
  st: 'PA',
  p: 0.5,
  ...over,
})

test('columns use the electoral college model thresholds', () => {
  assert.equal(columnOf(0.95), 'solidD')
  assert.equal(columnOf(0.9), 'solidD')
  assert.equal(columnOf(0.894), 'leanD') // shows as 89%
  assert.equal(columnOf(0.6), 'leanD')
  assert.equal(columnOf(0.594), 'tossup')
  assert.equal(columnOf(0.41), 'tossup')
  assert.equal(columnOf(0.4), 'leanR')
  assert.equal(columnOf(0.11), 'leanR')
  assert.equal(columnOf(0.1), 'solidR')
  assert.equal(columnOf(0.0), 'solidR')
})

test('frozen columns hold the pre-election price', () => {
  const r = race({ p: 0.99, f: 0.52 })
  assert.equal(boardColumn(r, false), 'solidD')
  assert.equal(boardColumn(r, true), 'tossup')
  // No frozen price: the live one.
  assert.equal(boardColumn(race({ p: 0.7 }), true), 'leanD')
})

test('calls and flips', () => {
  assert.equal(calledFrom({ dem: 0.995, rep: 0.004, other: 0.001 }), 'D')
  assert.equal(calledFrom({ dem: 0.5, rep: 0.49, other: 0.01 }), undefined)
  assert.equal(calledFrom({ dem: 0, rep: 0, other: 1 }), 'O')
  assert.ok(flipped(race({ c: 'D', h: 'R' })))
  assert.ok(!flipped(race({ c: 'D', h: 'D' })))
  assert.ok(!flipped(race({ c: 'D' })))
  assert.ok(!flipped(race({ c: 'O', h: 'R' })))
  assert.ok(!flipped(race({ h: 'R' })))
})

test('labels, names, ids and links', () => {
  assert.equal(raceLabel(race({ o: 'H', st: 'PA', d: 7 })), 'PA-7')
  assert.equal(raceLabel(race({ o: 'H', st: 'AK', d: 0 })), 'AK-AL')
  assert.equal(raceLabel(race({ o: 'P', st: 'NE', d: 2 })), 'NE-2')
  assert.equal(
    raceName(race({ o: 'H', st: 'PA', d: 7 })),
    "Pennsylvania's 7th district"
  )
  assert.equal(
    raceName(race({ o: 'H', st: 'NY', d: 12 })),
    "New York's 12th district"
  )
  assert.equal(
    raceName(race({ o: 'H', st: 'TX', d: 22 })),
    "Texas's 22nd district"
  )
  assert.equal(raceName(race({ o: 'H', st: 'AK', d: 0 })), 'Alaska at-large')
  assert.equal(raceName(race({ st: 'MN', sp: 1 })), 'Minnesota (special)')
  assert.notEqual(raceId(race({ st: 'MN' })), raceId(race({ st: 'MN', sp: 1 })))
  assert.equal(raceUrl(race({ s: 'abc' })), '/ManifoldPolitics/abc')
  assert.equal(raceUrl(race({ s: 'abc', u: 'Jack1' })), '/Jack1/abc')
  assert.equal(raceUrl(race({})), undefined)
})

test('grouping by rating, state and moves', () => {
  const races = [
    race({ st: 'PA', p: 0.52 }),
    race({ st: 'GA', p: 0.58 }),
    race({ st: 'CA', p: 0.97 }),
    race({ st: 'TX', p: 0.2, w: -0.04 }),
    race({ st: 'WY', p: 0.03, w: 0.02 }),
    race({ st: 'OH', p: 0.45, w: 0.005 }),
  ]
  const byRating = groupRaces(races, 'rating', false)
  assert.deepEqual(
    byRating.map((g) => g.key),
    ['solidD', 'leanD', 'tossup', 'leanR', 'solidR']
  )
  // Closest first within a column.
  assert.deepEqual(
    byRating[2].races.map((r) => r.st),
    ['PA', 'OH', 'GA']
  )
  const byState = groupRaces(races, 'state', false)
  assert.deepEqual(
    byState.map((g) => g.key),
    ['CA', 'GA', 'OH', 'PA', 'TX', 'WY']
  )
  const moves = groupRaces(races, 'moves', false)
  // Under a point doesn't count as a move.
  assert.deepEqual(
    moves[0].races.map((r) => r.st),
    ['TX', 'WY']
  )
  const totals = columnTotals(
    [
      race({ p: 0.95, ev: 10 }),
      race({ p: 0.5, ev: 19 }),
      race({ p: 0.5, ev: 6 }),
    ],
    false
  )
  assert.deepEqual(totals.tossup, { races: 2, ev: 25 })
  assert.deepEqual(totals.solidD, { races: 1, ev: 10 })
  assert.deepEqual(
    calledTotals(
      [race({ c: 'D', ev: 10 }), race({ c: 'R', ev: 3 }), race({})],
      'ev'
    ),
    { D: 10, R: 3, O: 0 }
  )
})

// ------------------------------------------------------------------ slots

test('a slot switches to the official market once it has caught up', () => {
  type M = {
    id: string
    visibility: string
    uniqueBettorCount: number
    deleted?: boolean
  }
  const official: M = { id: 'o', visibility: 'public', uniqueBettorCount: 10 }
  const community: M = { id: 'c', visibility: 'public', uniqueBettorCount: 25 }
  assert.equal(pickSlot(official, community)?.id, 'c')
  assert.equal(
    pickSlot({ ...official, uniqueBettorCount: 25 }, community)?.id,
    'o'
  )
  assert.equal(
    pickSlot({ ...official, uniqueBettorCount: 40 }, community)?.id,
    'o'
  )
  // Still unlisted while being created, or deleted: not yet.
  assert.equal(
    pickSlot(
      { ...official, visibility: 'unlisted', uniqueBettorCount: 99 },
      community
    )?.id,
    'c'
  )
  assert.equal(pickSlot({ ...official, deleted: true }, community)?.id, 'c')
  assert.equal(pickSlot(official, undefined)?.id, 'o')
  assert.equal(pickSlot(undefined, community)?.id, 'c')
  assert.equal(pickSlot(undefined, undefined), undefined)
})

// ------------------------------------------------------------------ mapping

test('places in questions, longest name first', () => {
  assert.equal(
    placeIn(
      'Who will win West Virginia in the 2028 Democratic presidential primaries?'
    ),
    'WV'
  )
  assert.equal(placeIn('Who will win Virginia?'), 'VA')
  assert.equal(placeIn('Who will win the District of Columbia in 2028?'), 'DC')
  assert.equal(placeIn('Who will win Washington, D.C. in 2028?'), 'DC')
  assert.equal(placeIn('Who will win Washington in 2028?'), 'WA')
  assert.equal(placeIn('Who will win Arkansas?'), 'AR')
  assert.equal(
    placeIn(
      'Who will win the 2028 Puerto Rico Democratic presidential primary?'
    ),
    'PR'
  )
  assert.equal(
    placeIn('Who will win the U.S. Virgin Islands Republican caucuses?'),
    'VI'
  )
  assert.equal(
    placeIn('Who will win the 2028 Democrats Abroad presidential primary?'),
    'DA'
  )
  assert.equal(
    placeIn('Who will win the 2028 US presidential election?'),
    undefined
  )
  assert.equal(placeIn('Ohio or Iowa?'), undefined)
})

test('national markets are classified for the page', () => {
  const row = (key: string, question: string, topics: string[] = []) =>
    classifyNational({ key, cycle: 2028, question, topics, reservedId: 'x' })
  assert.deepEqual(
    row(
      '2028-dem-iowa',
      'Who will win the 2028 Iowa Democratic presidential caucuses?',
      ['2028-presidential-primaries']
    ),
    {
      id: 'x',
      cycle: 2028,
      kind: 'presidential-primary',
      state: 'IA',
      party: 'D',
    }
  )
  assert.equal(
    row(
      '2028-gop-ohio',
      'Who will win Ohio in the 2028 Republican presidential primaries?'
    ).party,
    'R'
  )
  const senate = row(
    '2028-senate-primary-az-gop',
    'Who will win the 2028 Republican primary for U.S. Senate in Arizona?'
  )
  assert.equal(senate.kind, 'senate-primary')
  assert.equal(senate.state, 'AZ')
  assert.equal(senate.party, 'R')
  const topTwo = row(
    '2028-senate-primary-ca',
    'Who will finish first in the 2028 top-two primary for U.S. Senate in California?'
  )
  assert.equal(topTwo.kind, 'senate-primary')
  assert.equal(topTwo.party, undefined)
  const special = row(
    '2028-senate-primary-mn-dem',
    'Who will be the Democratic nominee in the 2028 U.S. Senate special election in Minnesota?'
  )
  assert.equal(special.special, true)
  assert.equal(
    row(
      '2028-governor-primary-nc-dem',
      'Who will win the 2028 Democratic primary for governor of North Carolina?'
    ).kind,
    'governor-primary'
  )
  const nominee = row(
    '2028-dem-nominee',
    'Who will be the 2028 Democratic presidential nominee?'
  )
  assert.equal(nominee.kind, 'national')
  assert.equal(
    nominee.q,
    'Who will be the 2028 Democratic presidential nominee?'
  )
  assert.equal(
    row(
      '2027-governor-kentucky',
      'Which party will win the 2027 Kentucky governor election?'
    ).kind,
    'national'
  )
})

test('pipeline markets are classified with their opening odds', () => {
  const entry = (over: object) => ({
    raceKey: 'k',
    status: 'ready',
    identity: { cycle: 2028, office: 'senate' as const, state: 'PA' },
    payload: {
      answers: ['Democratic Party', 'Republican Party'],
      answerProbs: [60, 39],
    },
    ...over,
  })
  const pa = classifyPipeline(entry({}), 'id1')
  assert.equal(pa.kind, 'senate')
  assert.equal(pa.pDem, 0.606)
  assert.equal(
    classifyPipeline(
      entry({
        identity: {
          cycle: 2028,
          office: 'senate',
          state: 'MN',
          election: 'special',
        },
      }),
      'id'
    ).special,
    true
  )
  assert.equal(
    classifyPipeline(
      entry({ identity: { cycle: 2028, office: 'president', state: 'US' } }),
      'id'
    ).kind,
    'president-national'
  )
  assert.equal(
    classifyPipeline(
      entry({
        identity: { cycle: 2028, office: 'president', state: 'PA' },
        proposition: 'popular-vote-party',
      }),
      'id'
    ).kind,
    'president-popular'
  )
  const ne2 = classifyPipeline(
    entry({
      identity: { cycle: 2028, office: 'president', state: 'NE', district: 2 },
    }),
    'id'
  )
  assert.equal(ne2.kind, 'president-unit')
  assert.equal(ne2.district, 2)
  assert.equal(
    classifyPipeline(
      entry({
        identity: { cycle: 2028, office: 'house', state: 'AK', district: 0 },
      }),
      'id'
    ).district,
    0
  )
})

test('the generated mapping covers every race the page wires', () => {
  const file = mapping as unknown as OfficialMarketsFile
  const refs = Object.entries(file.markets)
  const ids = refs.map(([, r]) => r.id)
  assert.equal(new Set(ids).size, ids.length)
  assert.ok(ids.every((id) => /^[0-9A-Za-z]{10}$/.test(id)))
  const units2028 = new Set(
    refs
      .filter(([, r]) => r.cycle === 2028 && r.kind === 'president-unit')
      .map(([, r]) =>
        r.district !== undefined ? `${r.state}-${r.district}` : r.state
      )
  )
  for (const u of ELECTORAL_UNITS) assert.ok(units2028.has(u.key), u.key)
  const count = (kind: string, cycle: number) =>
    refs.filter(([, r]) => r.kind === kind && r.cycle === cycle).length
  assert.equal(count('house', 2028), 435)
  assert.ok(count('senate', 2028) >= 34)
  assert.equal(count('governor', 2028), 11)
  assert.ok(count('presidential-primary', 2028) >= 102)
  for (const key of [
    '2028-president-US-general',
    '2028-dem-nominee',
    '2028-gop-nominee',
    '2028-dem-vp-nominee',
    '2028-gop-vp-nominee',
    '2028-popular-vote',
    '2028-balance-of-power',
    '2030-balance-of-power',
  ])
    assert.ok(file.markets[key], key)
})

// ------------------------------------------------------------------ primaries

test('a primary leader is the winner, else the best named candidate', () => {
  assert.deepEqual(
    pickLeader([
      { text: 'A', prob: 0.3 },
      { text: 'Other', prob: 0.6, isOther: true },
      { text: 'B', prob: 0.1 },
    ]),
    { text: 'A', prob: 0.3, won: false }
  )
  assert.deepEqual(
    pickLeader([
      { text: 'A', prob: 0 },
      { text: 'B', prob: 1, won: true },
    ]),
    { text: 'B', prob: 1, won: true }
  )
  assert.equal(
    pickLeader([{ text: 'Other', prob: 1, isOther: true }]),
    undefined
  )
})

test('primary rows: early states first, territories last', () => {
  const row = (st: string, o: PrimaryRow['o'] = 'P'): PrimaryRow => ({
    k: `${o}-${st}`,
    o,
    st,
  })
  const ordered = orderPrimaryRows([
    row('AL'),
    row('PR'),
    row('NV'),
    row('IA'),
    row('WY'),
    row('SC'),
    row('NH'),
    row('DA'),
    row('DC'),
  ]).map((r) => r.st)
  assert.deepEqual(ordered.slice(0, 4), ['IA', 'NH', 'SC', 'NV'])
  assert.deepEqual(ordered.slice(4, 7), ['AL', 'DC', 'WY'])
  assert.deepEqual(new Set(ordered.slice(7)), new Set(['PR', 'DA']))
})
