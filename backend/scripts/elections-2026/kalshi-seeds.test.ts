import { strict as assert } from 'assert'
import { test } from 'node:test'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import {
  API_BASE,
  PublicKalshi,
  compactMarket,
  relevantSeries,
  usableQuote,
  normalizeSeeds,
  houseEventMatches,
  matchHouse,
  matchBallot,
  manifestIdentity,
  marketIdentity,
  patchJson,
  reseed,
  assertOnlySeedsChanged,
  main,
  Market,
  Event,
  Snapshot,
  Review,
} from './kalshi-seeds'

const time = '2026-10-06T06:00:00.000Z'
test('discovery includes observed district series even when their display titles omit House', () => {
  assert.ok(
    relevantSeries({
      ticker: 'KXHOUSEUT02',
      title: 'Who will win UT-02',
      category: 'Elections',
    })
  )
  assert.ok(
    relevantSeries({
      ticker: 'OTHER',
      title: 'A state ballot proposal',
      category: 'Elections',
    })
  )
  assert.ok(
    !relevantSeries({
      ticker: 'KXHOUSEPRICE',
      title: 'House prices',
      category: 'Economics',
    })
  )
})
const market = (overrides: Partial<Market> = {}): Market => ({
  ticker: 'D',
  eventTicker: 'EVENT-26',
  title: 'Will Democratic win the House race for AL-01?',
  subtitle: '',
  yesSubtitle: 'Candidate D',
  rulesPrimary:
    'If the House member sworn in for AL-01 for the term beginning in 2027 is a member of the Democratic Party, then the market resolves to Yes.',
  status: 'active',
  createdTime: time,
  occurrenceTime: '',
  yesBid: 20,
  yesAsk: 24,
  noBid: 76,
  noAsk: 80,
  lastPrice: 10,
  bidSize: 100,
  askSize: 100,
  volume: 2000,
  volume24h: 50,
  openInterest: 1000,
  fetchedAt: time,
  ...overrides,
})
const entry = () => ({
  raceKey: '2026-house-AL-01-regular-general',
  status: 'ready',
  identity: { office: 'house', state: 'AL', stateName: 'Alabama', district: 1 },
  proposition: 'ballot-party',
  answerMeta: [
    { party: 'D', kind: 'party', label: 'Democratic' },
    { party: 'R', kind: 'party', label: 'Republican' },
    { party: 'other', kind: 'other', label: 'Other' },
  ],
  payload: {
    answers: ['Democratic', 'Republican', 'Other'],
    answerProbs: [3, 95, 2],
    question: 'Untouched',
    descriptionMarkdown: 'Untouched description',
    liquidityTier: 1000,
  },
  seed: { basis: 'old basis', note: 'untouched note' },
  dashboard: { key: 'AL-1' },
})
const event = (tickers = ['D', 'R']): Event => ({
  ticker: 'EVENT-26',
  seriesTicker: 'discovered',
  title: 'AL-01 House winner?',
  subtitle: 'AL-01',
  mutuallyExclusive: true,
  markets: tickers,
})
const snapshot = (
  markets = [
    market(),
    market({
      ticker: 'R',
      title: 'Will Republican win the House race for AL-01?',
      yesSubtitle: 'Candidate R',
      yesBid: 76,
      yesAsk: 80,
    }),
  ]
): Snapshot => ({
  apiBase: API_BASE,
  fetchedAt: time,
  series: [],
  events: [event(markets.map((m) => m.ticker))],
  markets: Object.fromEntries(markets.map((m) => [m.ticker, m])),
})

test('modern dollar quotes/fractional activity override legacy fields without rounding to whole cents', () => {
  const m = compactMarket(
    {
      ticker: 'X',
      event_ticker: 'E',
      yes_bid_dollars: '0.0050',
      yes_ask_dollars: '0.0340',
      yes_bid: 9,
      volume_fp: '123.45',
      volume: 200,
      open_interest_fp: '67.89',
    },
    time
  )
  assert.equal(m.yesBid, 0.5)
  assert.equal(m.yesAsk, 3.4)
  assert.equal(m.volume, 123.45)
  assert.equal(m.openInterest, 67.89)
  assert.equal(
    compactMarket(
      { ticker: 'X', event_ticker: 'E', yes_bid: 4, volume: 17 },
      time
    ).yesBid,
    4
  )
})
test('quote requires open, non-crossed two-sided book with spread at most 10c', () => {
  assert.deepEqual(usableQuote(market({ yesBid: 40, yesAsk: 50 })), {
    price: 45,
  })
  for (const overrides of [
    { yesAsk: 31 },
    { yesBid: 30, yesAsk: 20 },
    { status: 'settled' },
    { yesBid: -1 },
    { yesAsk: 101 },
    { yesBid: null },
    { yesAsk: null },
    { bidSize: 0 },
  ])
    assert.ok('reason' in usableQuote(market(overrides)))
})
test('one-sided low and complementary high extremes are flagged; last trade is not a fallback', () => {
  assert.equal(
    (usableQuote(market({ yesBid: 0, yesAsk: 2 })) as { price: number }).price,
    1
  )
  assert.ok('flag' in usableQuote(market({ yesBid: 0, yesAsk: 1 })))
  assert.equal(
    (
      usableQuote(market({ yesBid: 98.5, yesAsk: 100, askSize: 0 })) as {
        price: number
      }
    ).price,
    99.25
  )
  assert.ok(
    'reason' in usableQuote(market({ yesBid: 0, yesAsk: 3, lastPrice: 1 }))
  )
  assert.ok(
    'reason' in usableQuote(market({ yesBid: 0, yesAsk: 100, lastPrice: 50 }))
  )
})
test('floor/rescale and rounding produce bounded exact tenths with remainder on largest', () => {
  assert.deepEqual(normalizeSeeds([99.9, 0.05, 0.05]), [98, 1, 1])
  assert.deepEqual(normalizeSeeds([0, 0, 2]), [1, 1, 98])
  assert.deepEqual(normalizeSeeds([100, 0]), [99, 1])
  assert.deepEqual(normalizeSeeds([1, 1, 1]), [33.4, 33.3, 33.3])
  assert.deepEqual(normalizeSeeds([80, 20, 0]), [79.2, 19.8, 1])
  for (const weights of [
    [0.001, 0.002, 99, 10],
    [0, 2, 70, 28],
    [1, 2, 3],
    [0.1, 90, 50],
  ]) {
    const seeds = normalizeSeeds(weights)
    assert.equal(
      seeds.reduce((n, p) => n + Math.round(p * 10), 0),
      1000
    )
    assert.ok(seeds.every((p) => p >= 1 && p <= 99))
  }
  assert.throws(() => normalizeSeeds([0, 0]))
  assert.throws(() => normalizeSeeds([NaN, 1]))
})
test('House identity matches exact districts, at-large zero/one and excludes other cycles/offices', () => {
  assert.ok(houseEventMatches(entry(), event(), []))
  assert.ok(
    !houseEventMatches(
      entry(),
      { ...event(), title: 'AL-10 House winner?', subtitle: '' },
      []
    )
  )
  const wy = {
    ...entry(),
    identity: {
      office: 'house',
      state: 'WY',
      stateName: 'Wyoming',
      district: 0,
    },
  }
  assert.ok(
    houseEventMatches(
      wy,
      { ...event(), title: 'WY-AL House winner?', subtitle: '' },
      []
    )
  )
  assert.ok(
    houseEventMatches(
      wy,
      { ...event(), title: 'House Wyoming at-large', subtitle: '' },
      []
    )
  )
  assert.ok(
    houseEventMatches(
      entry(),
      { ...event(), title: 'Alabama 1st District House race', subtitle: '' },
      []
    )
  )
  for (const title of [
    'Alabama 1st state House race',
    'AL-01 House primary',
    'AL-01 House special election',
    'AL-01 House margin of victory',
  ])
    assert.ok(
      !houseEventMatches(entry(), { ...event(), title, subtitle: '' }, [])
    )
  assert.ok(
    !houseEventMatches(entry(), { ...event(), ticker: 'EVENT-24' }, [market()])
  )
})
test('House normalization aggregates third-party outcomes into Other and floors absent Other', () => {
  const s = snapshot()
  assert.deepEqual(matchHouse(entry(), s).proposed, [21.8, 77.2, 1])
  s.markets.G = market({
    ticker: 'G',
    title: 'Will Green win the House race for AL-01?',
    yesSubtitle: 'Unknown Green',
    yesBid: 3,
    yesAsk: 5,
  })
  s.markets.I = market({
    ticker: 'I',
    title: 'Will Independent win the House race for AL-01?',
    yesSubtitle: 'Unknown independent',
    yesBid: 1,
    yesAsk: 3,
  })
  s.events[0].markets.push('G', 'I')
  assert.deepEqual(matchHouse(entry(), s).proposed, [20.8, 73.5, 5.7])
})
test('one thin outcome rejects the entire House race; missing major-party quote is unmatched', () => {
  assert.equal(
    matchHouse(
      entry(),
      snapshot([
        market(),
        market({
          ticker: 'R',
          title: 'Will Republican win the House race for AL-01?',
          yesBid: 60,
          yesAsk: 90,
        }),
      ])
    ).status,
    'thin'
  )
  assert.equal(matchHouse(entry(), snapshot([market()])).status, 'unmatched')
})
test('same-party candidates are never priced from party outcomes', () => {
  const e = {
    ...entry(),
    proposition: 'candidate',
    answerMeta: [
      { party: 'D', kind: 'candidate', candidate: 'Candidate D' },
      { party: 'D', kind: 'candidate', candidate: 'Candidate R' },
    ],
  }
  assert.equal(matchHouse(e, snapshot()).status, 'unmatched')
})
const ballot = () => ({
  raceKey: '2026-measure-AL-amendment-1',
  status: 'ready',
  measure: {
    state: 'AL',
    designation: { kind: 'amendment', value: '1' },
    officialTitle: 'Specific subject',
    shortSubject: 'subject',
  },
  yesMeaning: 'Amendment 1 is approved by voters',
  payload: { initialProb: 50, question: 'Unchanged', liquidityTier: 1000 },
  seed: { basis: 'old', note: 'unchanged', needsReview: false },
})
const review = (
  e: ReturnType<typeof ballot>,
  s: Snapshot,
  direction: 'approval' | 'failure' = 'approval'
): Review => ({
  raceKey: e.raceKey,
  ticker: 'D',
  manifestIdentity: manifestIdentity(e),
  marketIdentity: marketIdentity(s.markets.D, s.events[0]),
  direction,
  evidence: 'Exact reviewed subject',
})
test('ballot approval and failure direction use complementary price, not portfolio normalization', () => {
  const e = ballot()
  const s = snapshot()
  assert.deepEqual(matchBallot(e, s, [review(e, s)]).proposed, [22])
  assert.deepEqual(matchBallot(e, s, [review(e, s, 'failure')]).proposed, [78])
})
test('changed ballot subject/number/YES meaning or Kalshi rules invalidate reviewed match', () => {
  const e = ballot()
  const s = snapshot()
  const r = review(e, s)
  assert.equal(
    matchBallot({ ...e, yesMeaning: 'Different meaning' }, s, [r]).status,
    'unmatched'
  )
  assert.equal(
    matchBallot(
      {
        ...e,
        measure: {
          ...e.measure,
          designation: { kind: 'amendment', value: '2' },
        },
      },
      s,
      [r]
    ).status,
    'unmatched'
  )
  s.markets.D.rulesPrimary += ' New condition.'
  assert.equal(matchBallot(e, s, [r]).status, 'unmatched')
})
test('manifest rewrite changes only permitted fields, retains CRLF and untouched RI bytes', () => {
  const ri = {
    ...entry(),
    raceKey: '2026-governor-RI-regular-general',
    identity: { office: 'governor' },
    payload: { ...entry().payload, answerProbs: [78, 8, 12, 2] },
  }
  const manifest = {
    manifestVersion: '2026-10-06.2',
    generatedAt: 'old',
    review: { approved: true, notes: 'Approved earlier', reviewedAt: 'old' },
    budget: { cap: 306000 },
    entries: [ri, entry()],
  }
  const raw = JSON.stringify(manifest, null, 2).replace(/\n/g, '\r\n') + '\r\n'
  const result = reseed(raw, snapshot(), [], time)
  assertOnlySeedsChanged(raw, result.output)
  const m = JSON.parse(result.output)
  assert.equal(m.manifestVersion, '2026-10-06.3')
  assert.equal(m.review.approved, false)
  assert.deepEqual(m.entries[0], ri)
  assert.deepEqual(m.entries[1].payload.answerProbs, [21.8, 77.2, 1])
  assert.equal(m.entries[1].seed.source.kind, 'kalshi')
  assert.equal(
    m.entries[1].payload.descriptionMarkdown,
    'Untouched description'
  )
  assert.ok(!/(?<!\r)\n/.test(result.output))
  assert.ok(result.output.includes('[21.8, 77.2, 1.0]'))
})
test('thin and held seeds stay unchanged and receive existing provenance', () => {
  const e = entry()
  const m = {
    manifestVersion: 'old',
    generatedAt: 'old',
    review: { approved: true, notes: '' },
    entries: [e, { ...e, raceKey: 'held', status: 'unresolved' }],
  }
  const s = snapshot()
  s.markets.D.yesAsk = 80
  const result = JSON.parse(
    reseed(JSON.stringify(m, null, 2), s, [], time).output
  )
  for (const row of result.entries) {
    assert.deepEqual(row.payload.answerProbs, [3, 95, 2])
    assert.deepEqual(row.seed.source, { kind: 'existing' })
    assert.equal(row.seed.basis, 'old basis')
  }
})
test('JSON edits preserve unrelated formatting and insert metadata without rewriting objects', () => {
  const raw =
    '{\n  "outer": { "a": [1, 2], "seed": {\n    "basis": "old"\n  } }\n}\n'
  const result = patchJson(raw, [
    { keys: ['outer', 'seed', 'source'], value: { kind: 'existing' } },
  ])
  assert.ok(result.startsWith('{\n  "outer": { "a": [1, 2], "seed": {'))
  assert.deepEqual(JSON.parse(result).outer.seed.source, { kind: 'existing' })
})
test('public GET pagination throttles, backs off on 429, sends no credentials, and honors cursors', async () => {
  let clock = 1000
  const pauses: number[] = []
  const calls: { url: URL; init: RequestInit; time: number }[] = []
  const responses = [
    new Response('', { status: 429, headers: { 'retry-after': '2' } }),
    Response.json({ events: [{ id: 1 }], cursor: 'next' }),
    Response.json({ events: [{ id: 2 }], cursor: '' }),
  ]
  const client = new PublicKalshi(
    (async (url: URL, init: RequestInit) => {
      calls.push({ url, init, time: clock })
      return responses.shift()!
    }) as typeof fetch,
    async (ms) => {
      pauses.push(ms)
      clock += ms
    },
    () => clock
  )
  assert.deepEqual(await client.pages('/events', 'events'), [
    { id: 1 },
    { id: 2 },
  ])
  assert.equal(calls[2].url.searchParams.get('cursor'), 'next')
  assert.ok(
    calls.every(
      (c) =>
        c.url.origin === 'https://api.elections.kalshi.com' &&
        c.init.method === 'GET' &&
        !c.init.headers &&
        !c.init.body &&
        c.init.redirect === 'error'
    )
  )
  assert.ok(pauses.includes(2000))
  assert.ok(calls[2].time - calls[1].time >= 300)
})
test('failed API responses and repeated cursors throw rather than imply missing markets', async () => {
  const fail = new PublicKalshi(
    (async () => new Response('', { status: 400 })) as typeof fetch,
    async () => {}
  )
  await assert.rejects(fail.pages('/series', 'series'), /400/)
  const repeat = new PublicKalshi(
    (async () =>
      Response.json({ markets: [], cursor: 'same' })) as typeof fetch,
    async () => {}
  )
  await assert.rejects(repeat.pages('/markets', 'markets'), /Repeated/)
  await assert.rejects(fail.get('/orders' as '/markets'), /Read-only/)
})
test('--check performs zero filesystem writes or network requests with a saved snapshot', async () => {
  const file = path.join(
    os.tmpdir(),
    `kalshi-check-${process.pid}-${Date.now()}.json`
  )
  fs.writeFileSync(
    file,
    JSON.stringify({ ...snapshot(), events: [], markets: {} })
  )
  const write = fs.writeFileSync
  const stdout = process.stdout.write
  const fetcher = global.fetch
  try {
    Object.defineProperty(fs, 'writeFileSync', {
      value: () => {
        throw new Error('Unexpected filesystem write')
      },
    })
    process.stdout.write = (() => true) as typeof stdout
    global.fetch = (async () => {
      throw new Error('Unexpected network')
    }) as typeof fetch
    await main(['--check', '--snapshot', file])
  } finally {
    Object.defineProperty(fs, 'writeFileSync', { value: write })
    process.stdout.write = stdout
    global.fetch = fetcher
    fs.unlinkSync(file)
  }
})
