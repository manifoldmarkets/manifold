import { z } from 'zod'
import {
  MNX_API_URL,
  MNX_INSTRUMENTS,
  MNX_POLL_MS,
  MnxInstrument,
  OracleFeedHealth,
} from 'common/perps/mnx'
import { OraclePoint } from 'common/perps/oracle'
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
    oracle_price: z.number().finite().nullish(),
    oracle_price_e18_raw: rawPrice.nullish(),
    mark_price_timestamp: z.string(),
    oracle_frozen: z.boolean(),
    trading_enabled: z.boolean(),
    initial_margin_ratio_e18_raw: rawPrice,
    delisting: z.unknown().optional(),
  })
  .passthrough()

export type MnxMarket = z.infer<typeof marketSchema>
export type MnxFeedSnapshot = {
  marketId?: number
  health: OracleFeedHealth
  point?: OraclePoint
  maxLeverage?: number
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

export const mnxLaunchLeverage = (marginRaw: string): number => {
  const margin = BigInt(rawPrice.parse(marginRaw))
  if (margin <= BigInt(0) || margin > BigInt(10) ** BigInt(18))
    throw new Error('Invalid MNX initial margin ratio')
  // Integer leverage supported by the initial margin requirement. Providers
  // encode 1/3 as 333333333333333333, which still floors to exactly 3.
  const supported = Number(BigInt(10) ** BigInt(18) / margin)
  const leverage = Math.max(10, supported)
  if (leverage > 100) throw new Error('MNX leverage exceeds Manifold maximum')
  return leverage
}

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
        market.slug !== spec.slug ||
        market.type !== spec.type ||
        market.price_display !== spec.priceDisplay
      )
        throw new Error('MNX instrument type, slug, or units changed')
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
        ts > fetchedAt + MINUTE_MS ||
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
      if (prior?.point && ts < prior.point.ts)
        throw new Error('MNX source timestamp regressed')
      if (
        prior?.point &&
        ts === prior.point.ts &&
        (price !== prior.point.price ||
          prior.point.sourceData?.markPriceRaw !== market.mark_price_e18_raw)
      )
        throw new Error('MNX price conflicts at an immutable timestamp')
      const point: OraclePoint = {
        ts,
        sourceTs: ts,
        price,
        sourceData: {
          provider: 'mnx',
          kind: 'live',
          marketId: market.market_id,
          symbol: market.symbol,
          priceDisplay: market.price_display,
          markPriceRaw: market.mark_price_e18_raw,
          oraclePriceRaw: market.oracle_price_e18_raw ?? null,
          oraclePrice: market.oracle_price ?? null,
          fetchedAt,
        },
      }
      feeds[spec.feedId] = {
        ...identity,
        point,
        maxLeverage: mnxLaunchLeverage(market.initial_margin_ratio_e18_raw),
        health: {
          checkedAt: fetchedAt,
          status: 'available',
          priceTime: ts,
          price,
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
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
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
  const retryable =
    !(error instanceof MnxHttpError) ||
    error.status === 429 ||
    error.status >= 500
  const backoff = retryable
    ? Math.min(30 * MINUTE_MS, MNX_POLL_MS * 2 ** Math.min(failures - 1, 5)) *
      (1 + random * 0.2)
    : HOUR_MS
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
        sourceData: {
          provider: 'mnx',
          kind: 'candle',
          marketId,
          symbol: spec.symbol,
          priceDisplay: spec.priceDisplay,
          candleTime: candle.time,
          interval: '1h',
        },
      },
    ]
  })
}
