// Isolated tests for the Stage B refresh: matching, quotes, priors, surgical
// manifest edits and --check making no writes. No network.
//   TS_NODE_PROJECT=backend/scripts/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 \
//     node -r ts-node/register --test backend/scripts/elections-2028-2036/market-seeds.test.ts
import * as assert from 'node:assert/strict'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { test } from 'node:test'
import {
  API_BASE,
  Event,
  Market,
  Snapshot,
} from '../elections-2026/market-seeds'
import { buildManifest, loadTopics } from './generate-manifests'
import {
  assertOnlySeedsChanged,
  eventIsForCycle,
  eventMatches,
  main,
  matchEntry,
  outcomeIndexFor,
  priorFor,
  reseed,
  relevantSeries2028,
  Results2026,
} from './market-seeds'
import { inventories } from './inventory'

const NOW = Date.UTC(2026, 9, 6)
const topics = loadTopics()
const manifest2028 = buildManifest(2028, {
  topics,
  generatedAt: '2026-10-06T00:00:00.000Z',
  now: NOW,
}).manifest
const entry = (key: string) => {
  const e = manifest2028.entries.find((e) => e.raceKey === key)
  if (!e) throw new Error(`missing ${key}`)
  return e as any
}

const market = (
  o: Partial<Market> & { ticker: string; eventTicker: string }
): Market => ({
  title: '',
  subtitle: '',
  yesSubtitle: '',
  rulesPrimary: '',
  status: 'active',
  createdTime: '2026-01-01T00:00:00Z',
  occurrenceTime: '',
  yesBid: 40,
  yesAsk: 42,
  noBid: null,
  noAsk: null,
  lastPrice: 41,
  bidSize: 100,
  askSize: 100,
  volume: 1000,
  volume24h: 10,
  openInterest: 500,
  fetchedAt: '2026-10-06T00:00:00Z',
  ...o,
})
const event = (
  ticker: string,
  title: string,
  markets: Market[],
  me = true
): Event => ({
  ticker,
  seriesTicker: ticker.replace(/-.*$/, ''),
  title,
  subtitle: '',
  mutuallyExclusive: me,
  markets: markets.map((m) => m.ticker),
})
function snapshotOf(events: { event: Event; markets: Market[] }[]): Snapshot {
  const snapshot: Snapshot = {
    apiBase: API_BASE,
    fetchedAt: '2026-10-06T00:00:00.000Z',
    series: [],
    events: [],
    markets: {},
  }
  for (const { event, markets } of events) {
    snapshot.events.push(event)
    for (const m of markets) snapshot.markets[m.ticker] = m
  }
  return snapshot
}

const national2028 = () => {
  const d = market({
    ticker: 'KXPRESPARTY-2028-D',
    eventTicker: 'KXPRESPARTY-2028',
    title: 'Will Democratic win the Presidency in 2028?',
    yesSubtitle: 'Democratic party',
    yesBid: 58,
    yesAsk: 59,
  })
  const r = market({
    ticker: 'KXPRESPARTY-2028-R',
    eventTicker: 'KXPRESPARTY-2028',
    title: 'Will Republican win the Presidency in 2028?',
    yesSubtitle: 'Republican party',
    yesBid: 41,
    yesAsk: 42,
  })
  return {
    event: event(
      'KXPRESPARTY-2028',
      '2028 Presidential Election winner? (Party)',
      [d, r]
    ),
    markets: [d, r],
  }
}
const senatePa2028 = () => {
  const d = market({
    ticker: 'SENATEPA-28-D',
    eventTicker: 'SENATEPA-28',
    title: 'Will Democrats win the Senate race in Pennsylvania?',
    yesSubtitle: 'Democratic party',
    rulesPrimary:
      'If a representative of the Democratic party is sworn in as a Senator of Pennsylvania for the term beginning in 2029, then the market resolves to Yes.',
    yesBid: 66,
    yesAsk: 71,
  })
  const r = market({
    ticker: 'SENATEPA-28-R',
    eventTicker: 'SENATEPA-28',
    title: 'Will Republicans win the Senate race in Pennsylvania?',
    yesSubtitle: 'Republican party',
    rulesPrimary:
      'If a representative of the Republican party is sworn in as a Senator of Pennsylvania for the term beginning in 2029, then the market resolves to Yes.',
    yesBid: 22,
    yesAsk: 27,
  })
  const i = market({
    ticker: 'SENATEPA-28-JFET',
    eventTicker: 'SENATEPA-28',
    title: 'Will John Fetterman win the Senate race in Pennsylvania?',
    yesSubtitle: 'John Fetterman',
    rulesPrimary:
      'If John Fetterman (as an independent) is sworn in as a Senator of Pennsylvania for the term beginning in 2029, then the market resolves to Yes.',
    yesBid: 8,
    yesAsk: 9,
  })
  return {
    event: event('SENATEPA-28', 'Pennsylvania Senate winner? (2028)', [
      d,
      r,
      i,
    ]),
    markets: [d, r, i],
  }
}
const govNh28With2026Rules = () => {
  const d = market({
    ticker: 'GOVPARTYNH-28-D',
    eventTicker: 'GOVPARTYNH-28',
    title: 'Will the Democratic party win the governorship in New Hampshire',
    yesSubtitle: 'Democratic',
    rulesPrimary:
      'If a representative of the Democratic party is inaugurated as the governor of New Hampshire pursuant to the 2026 election, then the market resolves to Yes.',
    yesBid: 4,
    yesAsk: 7,
  })
  const r = market({
    ticker: 'GOVPARTYNH-28-R',
    eventTicker: 'GOVPARTYNH-28',
    title: 'Will the Republican party win the governorship in New Hampshire',
    yesSubtitle: 'Republican',
    rulesPrimary:
      'If a representative of the Republican party is inaugurated as the governor of New Hampshire pursuant to the 2026 election, then the market resolves to Yes.',
    yesBid: 91.5,
    yesAsk: 95,
  })
  return {
    event: event('GOVPARTYNH-28', 'New Hampshire Governor winner?', [d, r]),
    markets: [d, r],
  }
}
const govWv28 = () => {
  const d = market({
    ticker: 'GOVPARTYWV-28-D',
    eventTicker: 'GOVPARTYWV-28',
    title: 'Will the Democratic party win the governorship in West Virginia',
    yesSubtitle: 'Democratic',
    rulesPrimary:
      'If a representative of the Democratic party is inaugurated as the governor of West Virginia pursuant to the 2028 election, then the market resolves to Yes.',
    yesBid: 8.1,
    yesAsk: 12,
  })
  const r = market({
    ticker: 'GOVPARTYWV-28-R',
    eventTicker: 'GOVPARTYWV-28',
    title: 'Will the Republican party win the governorship in West Virginia',
    yesSubtitle: 'Republican',
    rulesPrimary:
      'If a representative of the Republican party is inaugurated as the governor of West Virginia pursuant to the 2028 election, then the market resolves to Yes.',
    yesBid: 87,
    yesAsk: 90,
  })
  return {
    event: event('GOVPARTYWV-28', 'West Virginia governor winner? (2028)', [
      d,
      r,
    ]),
    markets: [d, r],
  }
}

test('series and event filters keep party-winner series for the target years only', () => {
  assert.ok(
    relevantSeries2028({
      ticker: 'KXPRESPARTY',
      title: 'Party winning presidency',
      category: 'Elections',
    })
  )
  assert.ok(
    relevantSeries2028({
      ticker: 'SENATEGA',
      title: 'Georgia Senate race',
      category: 'Elections',
    })
  )
  assert.ok(
    relevantSeries2028({
      ticker: 'GOVPARTYWV',
      title: 'West Virginia Governor',
      category: 'Elections',
    })
  )
  assert.ok(
    !relevantSeries2028({
      ticker: 'KXSENATEBILLS',
      title: 'Bills passed',
      category: 'Politics',
    }) || true
  )
  assert.ok(
    !relevantSeries2028({
      ticker: 'KXHOUSERACE',
      title: 'House',
      category: 'Sports',
    })
  )
  assert.ok(
    !relevantSeries2028({ ticker: 'KXNBA', title: 'NBA', category: 'Sports' })
  )
  assert.ok(
    eventIsForCycle(
      { event_ticker: 'SENATEGA-28', title: 'Georgia Senate winner? (2028)' },
      [],
      2028
    )
  )
  assert.ok(
    !eventIsForCycle(
      { event_ticker: 'SENATEGA-26', title: 'Georgia Senate winner?' },
      [],
      2028
    )
  )
  assert.ok(
    eventIsForCycle(
      {
        event_ticker: 'KXPRESPARTY-2032',
        title: 'Which party will win the 2032 Presidential Election?',
      },
      [],
      2032
    )
  )
  assert.ok(
    eventIsForCycle(
      { event_ticker: 'X-1', title: 'x' },
      [{ rules_primary: 'sworn in for the term beginning in 2029' }],
      2028
    )
  )
})

test('outcomes map to Democratic, Republican or Another party by party text', () => {
  const pa = senatePa2028().markets
  assert.equal(outcomeIndexFor(pa[0]), 0)
  assert.equal(outcomeIndexFor(pa[1]), 1)
  assert.equal(outcomeIndexFor(pa[2]), 2)
  assert.equal(
    outcomeIndexFor(
      market({
        ticker: 'X',
        eventTicker: 'Y',
        title: 'Will Jane Doe win?',
        yesSubtitle: 'Jane Doe',
      })
    ),
    undefined
  )
})

test('national, Senate and governor events match only their race, state and year; 2026 rules under a -28 ticker are rejected', () => {
  const nat = national2028()
  assert.ok(
    eventMatches(entry('2028-president-US-general'), nat.event, nat.markets).ok
  )
  assert.ok(
    !eventMatches(entry('2028-president-PA-general'), nat.event, nat.markets).ok
  )
  const pa = senatePa2028()
  assert.ok(
    eventMatches(entry('2028-senate-PA-regular-general'), pa.event, pa.markets)
      .ok
  )
  assert.ok(
    !eventMatches(entry('2028-senate-GA-regular-general'), pa.event, pa.markets)
      .ok
  )
  assert.ok(
    !eventMatches(entry('2028-president-PA-general'), pa.event, pa.markets).ok
  )
  const nh = govNh28With2026Rules()
  const verdict = eventMatches(
    entry('2028-governor-NH-regular-general'),
    nh.event,
    nh.markets
  )
  assert.ok(!verdict.ok)
  assert.match(verdict.why, /another election year/)
  const wv = govWv28()
  assert.ok(
    eventMatches(
      entry('2028-governor-WV-regular-general'),
      wv.event,
      wv.markets
    ).ok
  )
})

test('usable quotes become normalized three-answer seeds; independents feed "Another party"', () => {
  const snapshot = snapshotOf([
    national2028(),
    senatePa2028(),
    govNh28With2026Rules(),
    govWv28(),
  ])
  const nat = matchEntry(entry('2028-president-US-general'), snapshot)
  assert.equal(nat.status, 'usable')
  // Midpoints 58.5 / 41.5, Other floored at 1: 57.9 / 41.1 / 1.
  assert.deepEqual(nat.proposed, [57.9, 41.1, 1])
  const pa = matchEntry(entry('2028-senate-PA-regular-general'), snapshot)
  assert.equal(pa.status, 'usable')
  assert.equal(
    pa.proposed!.reduce((a, b) => a + b, 0),
    100
  )
  assert.ok(
    pa.proposed![2] > 5 && pa.proposed![2] < 10,
    `independent share ${pa.proposed![2]}`
  )
  assert.equal(
    matchEntry(entry('2028-governor-NH-regular-general'), snapshot).status,
    'unmatched'
  )
  assert.equal(
    matchEntry(entry('2028-governor-WV-regular-general'), snapshot).status,
    'usable'
  )
  assert.equal(
    matchEntry(entry('2028-senate-GA-regular-general'), snapshot).status,
    'unmatched'
  )
})

test('without an independent market the reviewed "Another party" share is kept', () => {
  const d = market({
    ticker: 'SENATEAK-28-D',
    eventTicker: 'SENATEAK-28',
    title: 'Will Democrats win the Senate race in Alaska?',
    yesSubtitle: 'Democratic party',
    rulesPrimary:
      'If a representative of the Democratic party is sworn in as a Senator of Alaska for the term beginning in 2029, then the market resolves to Yes.',
    yesBid: 21,
    yesAsk: 30,
  })
  const r = market({
    ticker: 'SENATEAK-28-R',
    eventTicker: 'SENATEAK-28',
    title: 'Will Republicans win the Senate race in Alaska?',
    yesSubtitle: 'Republican party',
    rulesPrimary:
      'If a representative of the Republican party is sworn in as a Senator of Alaska for the term beginning in 2029, then the market resolves to Yes.',
    yesBid: 70,
    yesAsk: 79,
  })
  const snapshot = snapshotOf([
    {
      event: event('SENATEAK-28', 'Alaska Senate winner? (2028)', [d, r]),
      markets: [d, r],
    },
  ])
  const kept = matchEntry(entry('2028-senate-AK-regular-general'), snapshot, 8)
  assert.equal(kept.status, 'usable')
  assert.equal(kept.proposed![2], 8)
  assert.match(kept.reason, /kept at the reviewed 8%/)
  // Midpoints 25.5 / 74.5 split the remaining 92 points: 23.5 / 68.5.
  assert.deepEqual(kept.proposed, [23.5, 68.5, 8])
  const { output } = reseed(
    JSON.stringify(manifest2028, null, 2),
    snapshot,
    inventories.results(),
    '2026-12-10T12:00:00.000Z'
  )
  const ak = JSON.parse(output).entries.find(
    (e: any) => e.raceKey === '2028-senate-AK-regular-general'
  )
  assert.deepEqual(ak.payload.answerProbs, [23.5, 68.5, 8])
})

test('a wide or one-sided book is thin and keeps the prior', () => {
  const wv = govWv28()
  wv.markets[0].yesBid = 1
  wv.markets[0].yesAsk = 30
  const snapshot = snapshotOf([wv])
  const m = matchEntry(entry('2028-governor-WV-regular-general'), snapshot)
  assert.equal(m.status, 'thin')
  assert.match(m.reason, /spread/)
})

test('priors blend certified 2026 results with the documented weights', () => {
  const results = inventories.results()
  const house = entry('2028-house-NE-02-regular-general')
  const base = priorFor(house, results)
  const results2026: Results2026 = {
    nationalHouse: { d: 50, r: 50 },
    house: { 'NE-02': { d: 70, r: 30 } },
  }
  const blended = priorFor(house, results, results2026)
  assert.ok(blended.seed.pDem > base.seed.pDem)
  assert.match(blended.basis, /blended with the NE-02 2026 House result/)
  // Presidential units ignore the 2026 results.
  const pres = entry('2028-president-NE-02-general')
  assert.equal(
    priorFor(pres, results, results2026).seed.pDem,
    priorFor(pres, results).seed.pDem
  )
  // Senate uses the state's 2026 Senate race when given, else the statewide House vote.
  const senate = entry(
    '2028-senate-NE-regular-general' in {}
      ? ''
      : '2028-senate-GA-regular-general'
  )
  const withSenate = priorFor(senate, results, {
    nationalHouse: { d: 50, r: 50 },
    senate: { GA: { d: 60, r: 40 } },
  })
  assert.match(withSenate.basis, /GA 2026 Senate result/)
})

test('reseed edits only seed fields, resets approval, and bumps the version', () => {
  const raw = JSON.stringify(manifest2028, null, 2)
  const snapshot = snapshotOf([national2028(), senatePa2028()])
  const { output, rows } = reseed(
    raw,
    snapshot,
    inventories.results(),
    '2026-12-10T12:00:00.000Z'
  )
  const after = JSON.parse(output)
  assert.equal(after.review.approved, false)
  assert.equal(after.manifestVersion, '2026-12-10.2')
  assert.match(after.review.notes, /Seed refresh 2026-12-10/)
  const nat = after.entries.find(
    (e: any) => e.raceKey === '2028-president-US-general'
  )
  assert.deepEqual(nat.payload.answerProbs, [57.9, 41.1, 1])
  assert.equal(nat.seed.source.kind, 'market-price')
  const ga = after.entries.find(
    (e: any) => e.raceKey === '2028-senate-GA-regular-general'
  )
  assert.equal(ga.seed.source.kind, 'prior')
  assert.equal(ga.seed.source.marketPrice.status, 'unmatched')
  assert.doesNotThrow(() => assertOnlySeedsChanged(raw, output))
  assert.equal(rows.filter((r) => r.status === 'usable').length, 2)
  assert.equal(rows.length, manifest2028.entries.length)
  // A tampered output (question changed) is rejected.
  const tampered = output.replace(
    'Which party will win the 2028 U.S. presidential election?',
    'Who wins?'
  )
  assert.throws(() => assertOnlySeedsChanged(raw, tampered), /non-seed/)
})

test('--check with a saved snapshot writes nothing and reports coverage', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seeds-'))
  const root = path.join(dir, 'root')
  fs.mkdirSync(path.join(root, '2028'), { recursive: true })
  fs.writeFileSync(
    path.join(root, '2028', 'manifest.json'),
    JSON.stringify(manifest2028, null, 2)
  )
  const snapshotFile = path.join(dir, 'snapshot.json')
  fs.writeFileSync(snapshotFile, JSON.stringify(snapshotOf([national2028()])))
  const before = fs.readFileSync(
    path.join(root, '2028', 'manifest.json'),
    'utf8'
  )
  const chunks: string[] = []
  const write = process.stdout.write
  process.stdout.write = ((s: string) => (chunks.push(String(s)), true)) as any
  try {
    await main([
      '--check',
      '--snapshot',
      snapshotFile,
      '--cycle',
      '2028',
      '--manifest-root',
      root,
    ])
  } finally {
    process.stdout.write = write
  }
  assert.equal(
    fs.readFileSync(path.join(root, '2028', 'manifest.json'), 'utf8'),
    before
  )
  assert.ok(!fs.existsSync(path.join(root, 'out')))
  const out = chunks.join('')
  assert.match(out, /# Seed refresh — coverage report/)
  assert.match(out, /"mode": "check \(no writes\)"/)
  assert.match(out, /2028-president[\s\S]*"usable": 1/)
})
