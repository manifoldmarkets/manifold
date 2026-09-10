import { z } from 'zod'
import {
  MNX_API_URL,
  MNX_INSTRUMENTS,
  MNX_POLL_MS,
  MnxInstrument,
} from 'common/perps/mnx'
import { OracleFeedHealth } from 'common/perps/oracle-health'
import {
  MAX_ORACLE_FUTURE_SKEW_MS,
  getPerpOracleFreshness,
  OraclePoint,
} from 'common/perps/oracle'
import { HOUR_MS, MINUTE_MS } from 'common/util/time'

const rawPrice = z.string().regex(/^\d{1,80}$/)
const marketSchema = z
  .object({
    market_id: z.number().int().positive(),
    symbol: z.string(),
    slug: z.string(),
    type: z.string(),
    price_display: z.string(),
    mark_price: z.number().finite().positive(),
    mark_price_e18_raw: rawPrice,
    mark_price_timestamp: z.string(),
    oracle_frozen: z.boolean(),
    trading_enabled: z.boolean(),
    initial_margin_ratio_e18_raw: z.unknown(),
    delisting: z.unknown().optional(),
  })
  .passthrough()

export type MnxMarket = z.infer<typeof marketSchema>
export type MnxFeedSnapshot = {
  marketId?: number
  health: OracleFeedHealth
  point?: OraclePoint
  supportedLeverage?: number
  maxLeverage?: number
  markPriceRaw?: string
}
export type MnxSnapshot = {
  fetchedAt: number
  markets: unknown[]
  feeds: Record<string, MnxFeedSnapshot>
}

/** Exact decimal placement, followed by ONE conversion for the numeric engine.
 * Never round a scaled integer through Number before dividing by 10^18. */
export const mnxRawToNumber = (raw: string): number => {
  const validated = rawPrice.parse(raw)
  const padded = validated.padStart(19, '0')
  return Number(`${padded.slice(0, -18)}.${padded.slice(-18)}`)
}

export const mnxSupportedLeverage = (marginRaw: string): number => {
  const margin = BigInt(rawPrice.parse(marginRaw))
  if (margin <= BigInt(0) || margin > BigInt(10) ** BigInt(18))
    throw new Error('Invalid MNX initial margin ratio')
  // Integer leverage supported by the initial margin requirement. Providers
  // encode 1/3 as 333333333333333333, which still floors to exactly 3.
  const supported = Number(BigInt(10) ** BigInt(18) / margin)
  return Math.min(100, supported)
}

export const mnxLaunchLeverage = (marginRaw: string) =>
  Math.min(3, mnxSupportedLeverage(marginRaw))

export const parseMnxSnapshot = (
  payload: unknown,
  fetchedAt = Date.now(),
  previous?: MnxSnapshot | null
): MnxSnapshot => {
  if (!Array.isArray(payload)) throw new Error('Expected MNX market array')
  if (!Number.isFinite(fetchedAt) || fetchedAt <= 0)
    throw new Error('Invalid fetch time')
  const feeds: MnxSnapshot['feeds'] = {}
  for (const spec of MNX_INSTRUMENTS) {
    const prior = previous?.feeds[spec.feedId]
    const matches = payload.filter((m) => m && m.symbol === spec.symbol)
    let identity: Pick<MnxFeedSnapshot, 'marketId'> = {}
    try {
      if (matches.length !== 1)
        throw new Error(
          matches.length
            ? 'Duplicate MNX symbol'
            : 'Missing from MNX active markets'
        )
      const market = marketSchema.parse(matches[0])
      if (
        payload.filter((m) => m && m.market_id === market.market_id).length !==
        1
      )
        throw new Error('Duplicate MNX market ID')
      if (
        market.market_id !== spec.marketId ||
        market.slug !== spec.slug ||
        market.type !== spec.type ||
        market.price_display !== spec.priceDisplay
      )
        throw new Error('MNX instrument identity, type, slug, or units changed')
      if (prior?.marketId != null && prior.marketId !== market.market_id)
        throw new Error('MNX market identity changed')
      // Bind identity even when an otherwise well-formed market is frozen.
      identity = { marketId: market.market_id }
      if (!market.trading_enabled || market.delisting != null)
        throw new Error('MNX trading disabled or market delisted')
      if (market.oracle_frozen) throw new Error('MNX reports its oracle frozen')
      const ts = Date.parse(market.mark_price_timestamp)
      if (
        !Number.isFinite(ts) ||
        ts <= 0 ||
        ts > fetchedAt + MAX_ORACLE_FUTURE_SKEW_MS ||
        fetchedAt - ts > spec.maxAgeMs
      )
        throw new Error('MNX source timestamp is missing, invalid, or stale')
      const price = mnxRawToNumber(market.mark_price_e18_raw)
      if (
        !Number.isFinite(price) ||
        price < spec.minPrice ||
        price > spec.maxPrice
      )
        throw new Error('MNX mark price outside instrument bounds')
      // The API's numeric convenience fields are rounded to eight decimals.
      if (Math.abs(price - market.mark_price) > Math.max(1e-8, price * 1e-12))
        throw new Error('MNX numeric and exact mark prices disagree')
      if (prior?.point && ts < prior.point.sourceTs!)
        throw new Error('MNX source timestamp regressed')
      if (
        prior?.point &&
        ts === prior.point.sourceTs &&
        (price !== prior.point.price ||
          prior.markPriceRaw !== market.mark_price_e18_raw)
      )
        throw new Error('MNX price conflicts at an immutable timestamp')
      const point: OraclePoint = { ts: fetchedAt, sourceTs: ts, price }
      // Margin configuration affects new launches only, never an existing feed.
      let supportedLeverage: number | undefined
      let maxLeverage: number | undefined
      try {
        supportedLeverage = mnxSupportedLeverage(
          String(market.initial_margin_ratio_e18_raw)
        )
        maxLeverage = Math.min(3, supportedLeverage)
      } catch {
        /* creation refuses unsupported provider margin metadata */
      }
      feeds[spec.feedId] = {
        ...identity,
        point,
        maxLeverage,
        supportedLeverage,
        markPriceRaw: market.mark_price_e18_raw,
        health: {
          checkedAt: fetchedAt,
          status: 'available',
          expiresAt: Math.min(fetchedAt + 5 * MINUTE_MS, ts + spec.maxAgeMs),
        },
      }
    } catch (error) {
      feeds[spec.feedId] = {
        ...prior,
        ...identity,
        // Retain the last valid point for chronology, never republish it as fresh.
        point: prior?.point,
        health: {
          checkedAt: fetchedAt,
          status: 'unavailable',
          reason:
            error instanceof z.ZodError
              ? 'MNX returned incomplete or invalid market data'
              : error instanceof Error
              ? error.message
              : String(error),
        },
      }
    }
  }
  return { fetchedAt, markets: payload, feeds }
}

export class MnxHttpError extends Error {
  constructor(readonly status: number, readonly retryAfter: string | null) {
    super(`MNX returned HTTP ${status}`)
  }
}

export const fetchMnxMarkets = async (): Promise<unknown> => {
  const response = await fetch(`${MNX_API_URL}/markets`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Manifold-oracle/1.0 (+https://manifold.markets/perps)',
    },
    signal: AbortSignal.timeout(1_500),
  })
  if (!response.ok) {
    await response.arrayBuffer()
    throw new MnxHttpError(response.status, response.headers.get('retry-after'))
  }
  return response.json()
}

export const mnxRetryDelay = (
  error: unknown,
  failures: number,
  now: number,
  random = Math.random()
) => {
  const backoff =
    Math.min(
      MINUTE_MS,
      MNX_POLL_MS * 2 ** Math.min(Math.max(0, failures - 1), 5)
    ) *
    (1 + random * 0.2)
  const header = error instanceof MnxHttpError ? error.retryAfter : null
  const seconds =
    header != null && /^\d+(\.\d+)?$/.test(header.trim()) ? Number(header) : NaN
  const retryAt =
    header == null
      ? NaN
      : Number.isFinite(seconds)
      ? now + seconds * 1000
      : Date.parse(header)
  return Math.max(backoff, Number.isFinite(retryAt) ? retryAt - now : 0)
}

export const parseMnxCandles = (
  payload: unknown,
  spec: MnxInstrument,
  marketId: number,
  cutoff: number
): OraclePoint[] => {
  const parsed = z
    .object({
      market_id: z.literal(marketId),
      interval: z.literal('1h'),
      candlesticks: z.array(
        z.object({
          time: z.number().int().positive(),
          close: z.number().finite().positive(),
        })
      ),
    })
    .parse(payload)
  return parsed.candlesticks.flatMap((candle) => {
    const ts = candle.time * 1000 + HOUR_MS
    if (ts >= cutoff) return [] // completed candles strictly before live data
    if (candle.close < spec.minPrice || candle.close > spec.maxPrice)
      throw new Error('Invalid MNX candle close')
    return [
      {
        ts,
        sourceTs: candle.time * 1000,
        price: candle.close,
      },
    ]
  })
}

/** Shared request per tick; keep failures shared too so 16 feeds do not each
 * retry an outage. Restarting polls immediately. Retry-After always wins. */
export const createMnxSnapshotFetcher = (fetchMarkets = fetchMnxMarkets) => {
  let cached: Promise<MnxSnapshot> | undefined
  let previous: MnxSnapshot | undefined
  let startedAt = 0
  let inFlight = false
  let retryAt = 0
  let failures = 0
  return () => {
    const now = Date.now()
    if (
      cached &&
      (inFlight || now - startedAt < MNX_POLL_MS / 2 || now < retryAt)
    )
      return cached
    startedAt = now
    inFlight = true
    cached = fetchMarkets()
      .then((payload) => {
        previous = parseMnxSnapshot(payload, Date.now(), previous)
        failures = 0
        retryAt = 0
        return previous
      })
      .catch((error) => {
        retryAt = Date.now() + mnxRetryDelay(error, ++failures, Date.now())
        throw error
      })
      .finally(() => {
        inFlight = false
      })
    return cached
  }
}

export const fetchMnxSnapshot = createMnxSnapshotFetcher()
export const fetchMnxObservation = async (feedId: string) =>
  (await fetchMnxSnapshot()).feeds[feedId]

export const requireMnxReady = (
  snapshot: MnxSnapshot,
  feedId: string,
  now = Date.now()
) => {
  const feed = snapshot.feeds[feedId]
  if (!feed?.point || !feed.maxLeverage || feed.maxLeverage <= 1)
    throw new Error('MNX has no validated live observation or launch margin')
  const freshness = getPerpOracleFreshness(
    {
      oracleFeedId: feedId,
      oraclePrice: feed.point.price,
      oraclePriceTime: feed.point.ts,
      maxOraclePriceAgeMs: 5 * MINUTE_MS,
      oracleFeedHealth: feed.health,
    },
    now
  )
  if (freshness.status !== 'fresh')
    throw new Error(freshness.reason ?? 'MNX observation is stale')
  return feed
}
