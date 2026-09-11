import { MNX_INSTRUMENTS } from 'common/perps/mnx'
import { DAY_MS, HOUR_MS, MINUTE_MS } from 'common/util/time'
import {
  parseMnxSnapshot,
  mnxRawToNumber,
  mnxLaunchLeverage,
  mnxRetryDelay,
  MnxHttpError,
  parseMnxCandles,
  createMnxSnapshotFetcher,
} from './mnx'

jest.mock('./utils', () => ({
  log: Object.assign(jest.fn(), { warn: jest.fn(), error: jest.fn() }),
}))
afterEach(() => jest.restoreAllMocks())

const now = 1_800_000_000_000
const spec = MNX_INSTRUMENTS[0]
const market = (over: Record<string, unknown> = {}) => ({
  market_id: 11,
  symbol: 'ANTHROPIC',
  slug: 'anthropic',
  type: 'future',
  price_display: 'billion_usd',
  mark_price: 2104,
  mark_price_e18_raw: '2104000000000000000000',
  oracle_price: 2100,
  oracle_price_e18_raw: '2100000000000000000000',
  mark_price_timestamp: new Date(now).toISOString(),
  oracle_frozen: false,
  trading_enabled: true,
  initial_margin_ratio_e18_raw: '333333333333333333',
  ...over,
})
const read = (over: Record<string, unknown> = {}) =>
  parseMnxSnapshot([market(over)], now).feeds[spec.feedId]

it('converts exact scaled integers without first rounding them to Number', () => {
  expect(mnxRawToNumber('2104000000000000000000')).toBe(2104)
  expect(mnxRawToNumber('3260000000000000000')).toBe(3.26)
  expect(mnxRawToNumber('1')).toBe(1e-18)
  const precise = '2104123456789012610000'
  expect(mnxRawToNumber(precise)).toBe(2104.123456789013)
  expect(mnxRawToNumber(precise)).not.toBe(Number(precise) / 1e18)
  expect(() => mnxRawToNumber('1e18')).toThrow()
})

it.each(['333333333333333333', '200000000000000000', '100000000000000000'])(
  'caps launch recommendation at 3x for margin %s',
  (margin) => {
    expect(mnxLaunchLeverage(margin)).toBe(3)
  }
)
it('uses higher upstream leverage without exceeding the engine domain', () => {
  expect(mnxLaunchLeverage('50000000000000000')).toBe(3)
  expect(() => mnxLaunchLeverage('0')).toThrow()
  expect(mnxLaunchLeverage('1000000000000000')).toBe(3)
  expect(mnxLaunchLeverage('500000000000000000')).toBe(2)
})

it('selects mark prices and retains reference values and raw units separately', () => {
  const feed = read()
  expect(feed.health.status).toBe('available')
  expect(feed.point).toMatchObject({
    price: 2104,
    ts: now,
    sourceTs: now,
  })
})

it.each([
  { mark_price: null },
  { mark_price: 0 },
  { mark_price_e18_raw: null },
  { mark_price_e18_raw: '0' },
  { mark_price_e18_raw: '-1' },
  { mark_price: 2105 },
  { mark_price_timestamp: null },
  { mark_price_timestamp: 'bad' },
  { mark_price_timestamp: new Date(now + 6 * MINUTE_MS).toISOString() },
  { mark_price_timestamp: new Date(now - 6 * MINUTE_MS).toISOString() },
  { trading_enabled: false },
  { oracle_frozen: true },
  { oracle_frozen: null },
  { type: 'binary_future' },
  { price_display: 'usd' },
  { slug: 'different' },
  { delisting: {} },
])('rejects unusable MNX metadata: %j', (over) =>
  expect(read(over).health.status).toBe('unavailable')
)

it('rejects envelopes, detects duplicates, and isolates unavailable symbols', () => {
  expect(() => parseMnxSnapshot({ markets: [] }, now)).toThrow(/array/)
  expect(
    parseMnxSnapshot([market(), market()], now).feeds[spec.feedId].health.status
  ).toBe('unavailable')
  const parsed = parseMnxSnapshot([market(), { symbol: 'OPENAI' }], now)
  expect(parsed.feeds[spec.feedId].health.status).toBe('available')
  expect(parsed.feeds['mnx-openai-mark'].health.status).toBe('unavailable')
})

it('pins identity and chronology across missing/disabled intervals', () => {
  const frozen = parseMnxSnapshot([market({ oracle_frozen: true })], now)
  expect(frozen.feeds[spec.feedId].marketId).toBe(11)
  expect(frozen.feeds[spec.feedId].point).toBeUndefined()
  expect(
    parseMnxSnapshot([market({ market_id: 99 })], now, frozen).feeds[
      spec.feedId
    ].health.reason
  ).toMatch(/identity|instrument/)
  const first = parseMnxSnapshot([market()], now)
  const missing = parseMnxSnapshot([], now + MINUTE_MS, first)
  expect(missing.feeds[spec.feedId].marketId).toBe(11)
  expect(missing.feeds[spec.feedId].point?.ts).toBe(now)
  const changed = parseMnxSnapshot(
    [market({ market_id: 99 })],
    now + MINUTE_MS,
    missing
  )
  expect(changed.feeds[spec.feedId].health.reason).toMatch(
    /identity|instrument/
  )
  const conflicting = parseMnxSnapshot(
    [
      market({
        mark_price: 2105,
        mark_price_e18_raw: '2105000000000000000000',
      }),
    ],
    now + MINUTE_MS,
    first
  )
  expect(conflicting.feeds[spec.feedId].health.reason).toMatch(/immutable/)
  const older = parseMnxSnapshot(
    [market({ mark_price_timestamp: new Date(now - 1).toISOString() })],
    now,
    first
  )
  expect(older.feeds[spec.feedId].health.reason).toMatch(/regressed/)
  const recovered = parseMnxSnapshot([market()], now + MINUTE_MS, missing)
  expect(recovered.feeds[spec.feedId].health.checkedAt).toBe(now + MINUTE_MS)
  expect(recovered.feeds[spec.feedId].point?.ts).toBe(now + MINUTE_MS)
  expect(recovered.feeds[spec.feedId].point?.sourceTs).toBe(now)
})

it('applies H100 source age separately from other instruments', () => {
  const h100 = market({
    market_id: 19,
    mark_price: 3.26,
    mark_price_e18_raw: '3260000000000000000',
    symbol: 'H100',
    slug: 'h100',
    type: 'perpetual',
    price_display: 'usd',
    mark_price_timestamp: new Date(now - HOUR_MS).toISOString(),
  })
  expect(
    parseMnxSnapshot([h100], now).feeds['mnx-h100-mark'].health.status
  ).toBe('available')
  expect(
    parseMnxSnapshot(
      [
        {
          ...h100,
          mark_price_timestamp: new Date(now - DAY_MS - 1).toISOString(),
        },
      ],
      now
    ).feeds['mnx-h100-mark'].health.status
  ).toBe('unavailable')
})

it('honors Retry-After seconds and HTTP dates and backs off other HTTP failures', () => {
  expect(mnxRetryDelay(new MnxHttpError(429, '600'), 1, now, 0)).toBe(600_000)
  expect(
    mnxRetryDelay(
      new MnxHttpError(503, new Date(now + HOUR_MS).toUTCString()),
      1,
      now,
      0
    )
  ).toBe(10 * MINUTE_MS)
  expect(mnxRetryDelay(new Error('timeout'), 2, now, 0)).toBe(4_000)
  expect(mnxRetryDelay(new MnxHttpError(403, null), 1, now, 0)).toBe(2_000)
})

it('labels completed candles and excludes unfinished/live-overlapping buckets', () => {
  const points = parseMnxCandles(
    {
      market_id: 11,
      interval: '1h',
      candlesticks: [
        { time: now / 1000 - 7200, close: 2100 },
        { time: now / 1000, close: 2104 },
      ],
    },
    spec,
    11,
    now
  )
  expect(points).toHaveLength(1)
  expect(points[0]).toMatchObject({
    ts: now - HOUR_MS,
    sourceTs: now - 2 * HOUR_MS,
  })
})

it('does not freeze existing feeds when launch margin metadata changes', () => {
  const feed = read({ initial_margin_ratio_e18_raw: 'new-encoding' })
  expect(feed.health.status).toBe('available')
  expect(feed.maxLeverage).toBeUndefined()
})

it('shares a single bounded request across all feeds, then polls on the next 2s tick', async () => {
  const clock = jest.spyOn(Date, 'now').mockReturnValue(now)
  const fetcher = jest.fn(async () => [market()])
  const fetchSnapshot = createMnxSnapshotFetcher(fetcher)
  const first = await Promise.all(MNX_INSTRUMENTS.map(() => fetchSnapshot()))
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(first.every((s) => s === first[0])).toBe(true)
  clock.mockReturnValue(now + 2_000)
  await fetchSnapshot()
  expect(fetcher).toHaveBeenCalledTimes(2)
  clock.mockRestore()
})

it('shares outages and honors Retry-After without relabeling old data as fresh', async () => {
  const clock = jest.spyOn(Date, 'now').mockReturnValue(now)
  const fetcher = jest
    .fn()
    .mockRejectedValueOnce(new MnxHttpError(429, '60'))
    .mockResolvedValue([market()])
  const fetchSnapshot = createMnxSnapshotFetcher(fetcher)
  await expect(fetchSnapshot()).rejects.toThrow('429')
  clock.mockReturnValue(now + 10_000)
  await expect(fetchSnapshot()).rejects.toThrow('429')
  expect(fetcher).toHaveBeenCalledTimes(1)
  clock.mockReturnValue(now + MINUTE_MS)
  const recovered = await fetchSnapshot()
  expect(recovered.feeds[spec.feedId].health.checkedAt).toBe(now + MINUTE_MS)
  expect(fetcher).toHaveBeenCalledTimes(2)
  clock.mockRestore()
})

it('caps excessive retry headers, retries after the cap, and a new process starts immediately', async () => {
  const clock = jest.spyOn(Date, 'now').mockReturnValue(now)
  const fetcher = jest
    .fn()
    .mockRejectedValueOnce(new MnxHttpError(503, '86400'))
    .mockResolvedValue([market()])
  const fetchSnapshot = createMnxSnapshotFetcher(fetcher)
  await expect(fetchSnapshot()).rejects.toThrow('next MNX attempt')
  clock.mockReturnValue(now + 9 * MINUTE_MS)
  await expect(fetchSnapshot()).rejects.toThrow('503')
  expect(fetcher).toHaveBeenCalledTimes(1)
  await createMnxSnapshotFetcher(fetcher)()
  expect(fetcher).toHaveBeenCalledTimes(2)
  clock.mockReturnValue(now + 10 * MINUTE_MS)
  await fetchSnapshot()
  expect(fetcher).toHaveBeenCalledTimes(3)
  expect(mnxRetryDelay(new MnxHttpError(429, 'nonsense'), 1, now, 0)).toBe(2000)
})

it('keeps H100 candle provenance behind a live mark older than the latest bucket', () => {
  const h100 = MNX_INSTRUMENTS.find((i) => i.symbol === 'H100')!
  const sourceTs = now - 70 * MINUTE_MS
  const points = parseMnxCandles(
    {
      market_id: h100.marketId,
      interval: '1h',
      candlesticks: [
        { time: (now - 3 * HOUR_MS) / 1000, close: 3.26 },
        { time: (now - 2 * HOUR_MS) / 1000, close: 3.26 },
      ],
    },
    h100,
    h100.marketId,
    sourceTs
  )
  expect(points).toHaveLength(1)
  expect(points[0].ts).toBeLessThan(sourceTs)
  expect(points[0].sourceTs).toBeLessThan(sourceTs)
})
