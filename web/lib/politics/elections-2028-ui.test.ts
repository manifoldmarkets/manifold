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
import type { ElectionLeaderboard } from 'common/election-leaderboards'
import { leaderboardScopes } from './election-leaderboard-scopes'
import {
  ELECTION_HUB_TOPICS,
  electionPathForTopic,
  hubTopicSlug,
  TIMELINE,
  upcomingTimeline,
} from './elections-2028-config'
import { ELECTORAL_UNITS } from './ec-model'
import {
  classifyNational,
  classifyPipeline,
  OfficialMarketsFile,
  pageLoads,
  pickChartSlot,
  pickSlot,
  placeIn,
} from './official-markets'
import {
  orderPrimaryRows,
  pickLeader,
  primaryOffice,
  PrimaryRow,
} from './primaries'
import {
  boardColumn,
  boardMode,
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
  assert.equal(sectionOrder('primaries')[4], 'primaries')
  assert.equal(sectionOrder('results')[1], 'board')
  assert.equal(sectionOrder('midterms2030')[2], 'midterms2030')
  // Data is only loaded where it shows.
  assert.ok(!showsSection('nomination', 'midterms2030'))
  assert.ok(showsSection('nomination', 'primaries'))
  assert.ok(!showsSection('general', 'primaries'))
  assert.ok(!showsSection('results', 'swings2026'))
  // The leaderboard card leads every phase (after the one-line 2026 result
  // while it shows); the map shows wherever the 2028 board does, until 2029.
  for (const phase of [
    'nomination',
    'primaries',
    'conventions',
    'general',
    'results',
    'midterms2030',
  ] as const) {
    const order = sectionOrder(phase)
    assert.equal(
      order.indexOf('leaderboards'),
      phase === 'nomination' ? 1 : 0,
      phase
    )
    assert.equal(showsSection(phase, 'map'), phase !== 'midterms2030', phase)
  }
})

test('the page reads in the order things happen, like the timeline', () => {
  const order = sectionOrder('nomination')
  const at = (k: Parameters<typeof showsSection>[1]) => order.indexOf(k)
  // The headline race and the map first, then the 2027 races, the
  // primaries, the conventions, Election Day, after.
  assert.equal(at('map'), at('race') + 1)
  const chronological = [
    'offYear',
    'primaries',
    'runningMates',
    'board',
    'later',
  ] as const
  for (let i = 1; i < chronological.length; i++)
    assert.ok(
      at(chronological[i - 1]) < at(chronological[i]),
      `${chronological[i - 1]} before ${chronological[i]}`
    )
  // Every timeline entry points at sections the page has ids for.
  const ids = new Set([
    'race',
    'map',
    'primaries',
    'running-mates',
    'board',
    'off-year',
    'midterms-2030',
    'later',
  ])
  for (const e of TIMELINE) {
    assert.ok(e.sections.length > 0, e.key)
    for (const id of e.sections) assert.ok(ids.has(id), `${e.key}: ${id}`)
  }
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
  const byRating = groupRaces(races, 'rating', 'live')
  assert.deepEqual(
    byRating.map((g) => g.key),
    ['solidD', 'leanD', 'tossup', 'leanR', 'solidR']
  )
  // Closest first within a column.
  assert.deepEqual(
    byRating[2].races.map((r) => r.st),
    ['PA', 'OH', 'GA']
  )
  const byState = groupRaces(races, 'state', 'live')
  assert.deepEqual(
    byState.map((g) => g.key),
    ['CA', 'GA', 'OH', 'PA', 'TX', 'WY']
  )
  const moves = groupRaces(races, 'moves', 'live')
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
    'live'
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

type SlotM = {
  id: string
  visibility: string
  uniqueBettorCount: number
  deleted?: boolean
}
const officialM: SlotM = { id: 'o', visibility: 'public', uniqueBettorCount: 0 }
const communityM: SlotM = {
  id: 'c',
  visibility: 'public',
  uniqueBettorCount: 25,
}

test('a slot takes the official market as soon as it is public', () => {
  assert.equal(pickSlot(officialM, communityM)?.id, 'o')
  // Still unlisted while being created, or deleted: not yet.
  assert.equal(
    pickSlot({ ...officialM, visibility: 'unlisted' }, communityM)?.id,
    'c'
  )
  assert.equal(pickSlot({ ...officialM, deleted: true }, communityM)?.id, 'c')
  assert.equal(pickSlot(officialM, undefined)?.id, 'o')
  assert.equal(pickSlot(undefined, communityM)?.id, 'c')
  assert.equal(pickSlot({ ...communityM, deleted: true }, undefined), undefined)
  assert.equal(pickSlot(undefined, undefined), undefined)
})

test('a line chart keeps the community market until the official one catches up', () => {
  assert.equal(pickChartSlot(officialM, communityM)?.id, 'c')
  assert.equal(
    pickChartSlot({ ...officialM, uniqueBettorCount: 25 }, communityM)?.id,
    'o'
  )
  assert.equal(
    pickChartSlot(
      { ...officialM, visibility: 'unlisted', uniqueBettorCount: 99 },
      communityM
    )?.id,
    'c'
  )
  assert.equal(pickChartSlot(officialM, undefined)?.id, 'o')
  assert.equal(pickChartSlot(undefined, communityM)?.id, 'c')
  assert.equal(pickChartSlot(undefined, undefined), undefined)
})

// ------------------------------------------------------------ hub topics

test('the US elections topics send visitors to /election', () => {
  assert.equal(
    electionPathForTopic('2028-us-elections'),
    '/election?topic=2028-us-elections'
  )
  assert.equal(electionPathForTopic('2026-midterms'), undefined)
  assert.equal(electionPathForTopic('us-politics'), undefined)
  // Each topic once; the Follow button's topic is among them.
  const slugs = ELECTION_HUB_TOPICS.map((t) => t.slug)
  assert.equal(new Set(slugs).size, slugs.length)
  assert.ok(slugs.includes(hubTopicSlug(2028)))
  assert.ok(slugs.includes(hubTopicSlug(2030)))
})

const board = (key: ElectionLeaderboard['key']): ElectionLeaderboard => ({
  key,
  label: key,
  updatedTime: 0,
  profit: [{ userId: 'u', score: 1 }],
  creator: [],
})

test('the leaderboard opens on 2026 for a while, then on the lead cycle', () => {
  const all = (
    ['2026', '2028', '2030', 'us-elections', 'us-politics'] as const
  ).map(board)
  const nov2026 = leaderboardScopes(all, 'nomination', at(2026, 11, 6))
  assert.equal(nov2026.defaultKey, '2026')
  // 2030's board waits for the 2030 phase.
  assert.deepEqual(
    nov2026.boards.map((b) => b.key),
    ['2026', '2028', 'us-elections', 'us-politics']
  )
  assert.equal(
    leaderboardScopes(all, 'nomination', at(2027, 3, 1)).defaultKey,
    '2028'
  )
  const in2029 = leaderboardScopes(all, 'midterms2030', at(2029, 3, 1))
  assert.equal(in2029.defaultKey, '2030')
  assert.ok(in2029.boards.some((b) => b.key === '2030'))
  // A missing board falls back to the first one there is.
  assert.equal(
    leaderboardScopes([board('us-politics')], 'nomination', at(2026, 11, 6))
      .defaultKey,
    'us-politics'
  )
  assert.deepEqual(
    leaderboardScopes([], 'nomination', at(2026, 11, 6)).boards,
    []
  )
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

test('the page loads each primary through its own year, 2027 included', () => {
  const markets = (mapping as unknown as OfficialMarketsFile).markets
  const mn = markets['2027-senate-special-minnesota-dem']
  assert.equal(mn?.kind, 'senate-primary')
  assert.equal(mn?.cycle, 2027)
  const show = (year: number, primaries = true, midterms2030 = false) => ({
    primaries,
    midterms2030,
    year,
  })
  assert.equal(pageLoads(mn, show(2027)), true)
  assert.equal(pageLoads(mn, show(2028)), false)
  assert.equal(pageLoads(mn, show(2027, false)), false)
  const iowa = { cycle: 2028, kind: 'presidential-primary' as const }
  assert.equal(pageLoads(iowa, show(2027)), true)
  assert.equal(pageLoads(iowa, show(2028)), true)
  assert.equal(pageLoads(iowa, show(2029)), false)
  assert.equal(
    pageLoads({ cycle: 2028, kind: 'president-popular' }, show(2027)),
    true
  )
  assert.equal(pageLoads({ cycle: 2028, kind: 'senate' }, show(2027)), true)
  assert.equal(pageLoads({ cycle: 2030, kind: 'senate' }, show(2029)), false)
  assert.equal(
    pageLoads({ cycle: 2030, kind: 'senate' }, show(2029, false, true)),
    true
  )
  assert.equal(pageLoads({ cycle: 2027, kind: 'national' }, show(2027)), true)
})

test('primary rows: an earlier year first, labelled with its year', () => {
  const rows: PrimaryRow[] = [
    { k: 'S-MN-sp-2028', o: 'S', st: 'MN', sp: 1 },
    { k: 'S-MN-sp-2027', o: 'S', st: 'MN', sp: 1, y: 2027 },
  ]
  assert.deepEqual(
    orderPrimaryRows(rows).map((r) => r.k),
    ['S-MN-sp-2027', 'S-MN-sp-2028']
  )
  assert.equal(primaryOffice(rows[1]), 'Senate (2027 special)')
  assert.equal(primaryOffice(rows[0]), 'Senate (special)')
  assert.equal(primaryOffice({ o: 'G' }), 'Governor')
  assert.equal(primaryOffice({ o: 'S', y: 2027 }), 'Senate (2027)')
})

test('by result once the frozen odds are gone: won, not yet called, won', () => {
  const races = [
    race({ st: 'PA', p: 0.97, c: 'D', h: 'R' }), // flipped
    race({ st: 'CA', p: 0.99, c: 'D', h: 'D' }),
    race({ st: 'GA', p: 0.55, f: 0.4 }),
    race({ st: 'NC', p: 0.48 }),
    race({ st: 'TX', p: 0.01, c: 'R', h: 'R', ev: 40 }),
  ]
  const groups = groupRaces(races, 'rating', 'results')
  assert.deepEqual(
    groups.map((g) => [g.key, g.label]),
    [
      ['wonD', 'Won by Democrats'],
      ['uncalled', 'Not yet called'],
      ['wonR', 'Won by Republicans'],
    ]
  )
  // Flips first among the won; the closest first among the uncalled.
  assert.deepEqual(
    groups[0].races.map((r) => r.st),
    ['PA', 'CA']
  )
  assert.deepEqual(
    groups[1].races.map((r) => r.st),
    ['NC', 'GA']
  )
  // An independent's win gets its own column.
  const withOther = groupRaces(
    [...races, race({ st: 'ME', c: 'O' })],
    'rating',
    'results'
  )
  assert.deepEqual(withOther[3].key, 'wonO')
  const totals = columnTotals(races, 'results')
  assert.deepEqual(totals.wonR, { races: 1, ev: 40 })
  assert.deepEqual(totals.uncalled, { races: 2, ev: 0 })
  // Frozen mode still reads the frozen odds.
  assert.equal(
    groupRaces(races, 'rating', 'frozen')[3].races.some((r) => r.st === 'GA'),
    true
  )
})

test('the board goes by result only when frozen odds are missing for good', () => {
  const mode = (frozen: boolean, missingFrozenOdds: number, gone: boolean) =>
    boardMode({ frozen, missingFrozenOdds, historyGone: gone })
  assert.equal(mode(false, 0, false), 'live')
  assert.equal(mode(false, 5, true), 'live')
  assert.equal(mode(true, 0, false), 'frozen')
  assert.equal(mode(true, 0, true), 'frozen') // the snapshot covers it
  assert.equal(mode(true, 3, false), 'frozen') // retried next revalidation
  assert.equal(mode(true, 3, true), 'results')
})
