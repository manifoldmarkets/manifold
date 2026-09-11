import { getConsensusMedian } from 'common/perps/oracle'
import {
  MAX_PLAUSIBLE_EUR_USD,
  MIN_PLAUSIBLE_EUR_USD,
  eurUsdFromBtcLegs,
  isPlausibleEurUsd,
  parseTwoSidedMid,
} from 'common/perps/fx-cross'

import { log } from './utils'

// EUR/USD spot, composited across the same venues btc-price.ts already uses.
// What the price means, why crypto venues, and the pure arithmetic all live in
// common/perps/fx-cross.ts; this module is the adapter and the cross-venue
// consensus, and follows btc-price.ts line for line where it can.
//
// ONE VOTE PER VENUE, and each vote internally consistent
//
// Three venues, three quotes, and the shape of each quote is chosen so that no
// vote can be wrong for a reason the cluster would accept:
//
//   bitstamp  direct EUR/USD book, mid of bid/ask. A real fiat pair, immune to
//             anything BTC does.
//   coinbase  direct EUR->USD rate from the documented exchange-rates route.
//             One value, no book, so no spread check is possible on it.
//   kraken    BTC/EUR and BTC/USD in ONE Ticker call, crossed. Both legs come
//             from the same response, so the cross is a single instant.
//
// The temptation is to add a fourth and fifth vote by crossing BTC legs on
// Coinbase and Bitstamp too. Deliberately not done: their APIs need one call
// per pair, and two calls are two instants. BTC moving 0.2% between them is
// 23 pips of pure fetch artefact, and because BTC moves globally, that error
// is CORRELATED across venues — two skewed crosses would agree with each other
// and outvote the correct direct quote. A wrong price that two sources
// corroborate is the one failure mode this whole design exists to prevent, so
// a venue only gets a cross vote when it can serve both legs at once.
//
// Adding a genuine fourth vote, in preference order:
//   1. The EURC/USDC Orca whirlpool on Solana, read through the existing
//      solana-rpc.ts + common/perps/solana-pools.ts path. Chain state, so no
//      terms at all — the strongest source we can have. It needs a PINNED pool
//      address, which must be probed first (the runbook's dexscreener command,
//      mint EURC). Note it is a stablecoin pair: EURC against USDC is two
//      pegs, and a USDC depeg would read as a EUR/USD move on that vote alone.
//   2. Gemini's btceur/btcusd, if and only if a single request can carry both
//      (its pubticker route is one pair per call, so today it cannot).
// Both need a live probe from an environment with egress to those hosts; this
// feed was written where that was blocked.
//
// TERMS
//
// Every endpoint below is a public, keyless, US-accessible route on a venue
// whose terms were already vetted for the BTC feed. Nothing new is consumed
// under anyone's licence, and as with BTC we publish a median WE compute, not
// a provider's number, so there is nothing being republished.

// Same budget and same reasoning as btc-price.ts: comfortably under the 2s
// oracle tick, because dispatch skips a feed while its previous run is in
// flight, so a hung request costs multiple ticks rather than one.
const FETCH_TIMEOUT_MS = 1_200

// The backfill is not on the tick and pulls a thousand candles in one response,
// so holding it to the tick's budget would time out a healthy history fetch.
const BACKFILL_FETCH_TIMEOUT_MS = 30_000

/**
 * Cross-venue agreement tolerance. Two orders of magnitude tighter than BTC's
 * 2%, and it has to be: 2% of EUR/USD is 230 pips, four times a normal day's
 * entire range, so BTC's tolerance here would corroborate garbage.
 *
 * 0.2% (~23 pips) is still generous against what these venues actually show —
 * healthy cross-venue disagreement is single-digit pips — and the slack is
 * there for the honest reasons: a thin weekend book, a venue whose fiat rail
 * is briefly backed up, and Kraken's cross inheriting its two BTC books'
 * spreads.
 *
 * If `[fx-price] no venue agreed` starts appearing more than occasionally, the
 * fix is to find WHICH source sits outside and drop or replace it — not to
 * widen this. A tolerance wide enough to always agree is not a check.
 */
const MAX_SOURCE_DIVERGENCE_FRAC = 0.002

const fetchJson = async (
  url: string,
  timeoutMs = FETCH_TIMEOUT_MS
): Promise<unknown> => {
  const res = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'Manifold/1.0 (+https://manifold.markets)',
    },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`${url}: ${res.status} ${res.statusText}`)
  return res.json()
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === 'object' && !Array.isArray(value)

/**
 * Bitstamp `GET /api/v2/ticker/eurusd/` — a genuine fiat book.
 *
 * Shape: `{ "bid": "1.1631", "ask": "1.1635", "last": "1.1633", ... }`.
 * Only bid/ask are read; `last` is deliberately ignored (see parseTwoSidedMid).
 */
const readBitstampEurUsd = (body: unknown): number | null => {
  if (!isRecord(body)) return null
  return parseTwoSidedMid(body.bid, body.ask)
}

/**
 * Coinbase `GET /v2/exchange-rates?currency=EUR` — every rate quoted against
 * one euro, so `rates.USD` IS EUR/USD with no arithmetic.
 *
 * Shape: `{ "data": { "currency": "EUR", "rates": { "USD": "1.1633", ... } } }`.
 * The currency echo is checked: asking for EUR and being served a payload
 * denominated in anything else would silently invert or rescale the rate, and
 * this is the one source with no second side to sanity-check against.
 */
const readCoinbaseEurUsd = (body: unknown): number | null => {
  if (!isRecord(body)) return null
  const data = body.data
  if (!isRecord(data)) return null
  if (
    typeof data.currency !== 'string' ||
    data.currency.toUpperCase() !== 'EUR'
  )
    return null
  const rates = data.rates
  if (!isRecord(rates)) return null
  const raw = rates.USD
  const rate =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && raw.trim() !== ''
      ? Number(raw.trim())
      : Number.NaN
  return Number.isFinite(rate) && rate > 0 ? rate : null
}

/**
 * Kraken `GET /0/public/Ticker?pair=XBTEUR,XBTUSD` — both legs, one response,
 * one instant.
 *
 * Shape: `{ "error": [], "result": { "XXBTZEUR": { "a": ["…"], "b": ["…"] },
 * "XXBTZUSD": { … } } }`, where `a`/`b` are [price, wholeLotVolume, volume].
 * Kraken returns its own canonical pair names, not the ones asked for, so the
 * result keys are the altnames — hence the explicit XXBTZEUR/XXBTZUSD lookups
 * (the same keys btc-price.ts already relies on).
 *
 * A non-empty `error` array fails the source: Kraken can return a 200 with a
 * partial result and an error, and half a cross is not a cross.
 */
const readKrakenEurUsd = (body: unknown): number | null => {
  if (!isRecord(body)) return null
  if (Array.isArray(body.error) && body.error.length > 0) return null
  const result = body.result
  if (!isRecord(result)) return null
  const eurLeg = readKrakenPairMid(result.XXBTZEUR)
  const usdLeg = readKrakenPairMid(result.XXBTZUSD)
  if (eurLeg == null || usdLeg == null) return null
  return eurUsdFromBtcLegs(eurLeg, usdLeg)
}

/** Mid of one Kraken pair's ask/bid arrays, whose first element is the price. */
const readKrakenPairMid = (pair: unknown): number | null => {
  if (!isRecord(pair)) return null
  const ask = Array.isArray(pair.a) ? pair.a[0] : undefined
  const bid = Array.isArray(pair.b) ? pair.b[0] : undefined
  return parseTwoSidedMid(bid, ask)
}

type FxSource = {
  name: string
  /** Resolves to a directly quoted EUR/USD rate, or null if unusable. */
  fetchRate: () => Promise<number | null>
}

const SOURCES: FxSource[] = [
  {
    name: 'bitstamp',
    fetchRate: async () =>
      readBitstampEurUsd(
        await fetchJson('https://www.bitstamp.net/api/v2/ticker/eurusd/')
      ),
  },
  {
    name: 'coinbase',
    fetchRate: async () =>
      readCoinbaseEurUsd(
        await fetchJson(
          'https://api.coinbase.com/v2/exchange-rates?currency=EUR'
        )
      ),
  },
  {
    name: 'kraken',
    fetchRate: async () =>
      readKrakenEurUsd(
        await fetchJson(
          'https://api.kraken.com/0/public/Ticker?pair=XBTEUR,XBTUSD'
        )
      ),
  },
]

type NamedRate = {
  source: string
  rate: number
}

/**
 * Return a rate only when at least two independent venues agree, exactly as
 * getBtcConsensusPrice does and for the same reason: agreement between venues
 * validates the current level without assuming EUR/USD moves slowly, and
 * unlike a temporal move cap it self-heals.
 */
export const getEurUsdConsensusRate = (
  quotes: readonly NamedRate[],
  maxDivergenceFrac = MAX_SOURCE_DIVERGENCE_FRAC
): number | null =>
  getConsensusMedian(
    quotes.map((quote) => quote.rate),
    maxDivergenceFrac
  )

export const fetchEurUsdSpot = async (): Promise<{
  ts: number
  price: number
} | null> => {
  const results = await Promise.allSettled(
    SOURCES.map(async (source) => {
      const rate = await source.fetchRate()
      if (rate == null) throw new Error(`${source.name}: unusable quote`)
      // The per-source plausibility gate, before the vote is cast. A source
      // that is wrong by a factor of 100 (cents) or 100x too small must not
      // reach the cluster, where it could pair with another broken source.
      if (!isPlausibleEurUsd(rate))
        throw new Error(
          `${source.name}: rate ${rate} outside plausible [${MIN_PLAUSIBLE_EUR_USD}, ${MAX_PLAUSIBLE_EUR_USD}]`
        )
      return rate
    })
  )

  const quotes: NamedRate[] = []
  results.forEach((result, index) => {
    if (result.status === 'fulfilled')
      quotes.push({ source: SOURCES[index].name, rate: result.value })
    else log(`[fx-price] ${SOURCES[index].name} failed: ${result.reason}`)
  })

  if (quotes.length < 2) {
    log.error(
      `[fx-price] only ${quotes.length}/${SOURCES.length} sources responded — skipping point`
    )
    return null
  }

  const price = getEurUsdConsensusRate(quotes)
  if (price == null) {
    log.error(
      `[fx-price] no venue agreed within ${
        MAX_SOURCE_DIVERGENCE_FRAC * 100
      }% (${quotes
        .map((quote) => `${quote.source}=${quote.rate}`)
        .join(', ')}) — skipping point`
    )
    return null
  }
  return { ts: Date.now(), price }
}

/** Bitstamp's largest OHLC page, and the step the backfill asks for. */
const OHLC_STEP_SECONDS = 3_600
const OHLC_LIMIT = 1_000

/**
 * Hourly EUR/USD closes from Bitstamp's OHLC route. BACKFILL ONLY.
 *
 * One venue, not three, and that is the right trade for history: the live
 * feed's consensus protects an EXECUTABLE mark, while this is chart context
 * being seeded before any market exists. Bitstamp is the one venue of the
 * three that quotes EUR/USD directly, so its candles need no cross and no
 * simultaneity argument. Every close still goes through the same plausibility
 * gate the live votes do.
 *
 * `limit` caps at 1000, so one call is about 41 days of hourly points — past
 * the 30-day, 720-point minimum the launch manifest asks of a fast feed. Older
 * history would need paging with `end`; add it only if a market ever needs a
 * longer chart than that.
 */
export const fetchEurUsdHourlyHistory = async (): Promise<
  { ts: number; price: number }[]
> => {
  const body = await fetchJson(
    `https://www.bitstamp.net/api/v2/ohlc/eurusd/?step=${OHLC_STEP_SECONDS}&limit=${OHLC_LIMIT}`,
    BACKFILL_FETCH_TIMEOUT_MS
  )
  if (!isRecord(body)) throw new Error('Bitstamp OHLC payload is not an object')
  const data = body.data
  if (!isRecord(data)) throw new Error('Bitstamp OHLC payload has no `data`')
  const candles = data.ohlc
  if (!Array.isArray(candles))
    throw new Error('Bitstamp OHLC payload has no `ohlc` array')

  const points: { ts: number; price: number }[] = []
  const skipped: string[] = []
  for (const candle of candles) {
    if (!isRecord(candle)) {
      skipped.push('candle is not an object')
      continue
    }
    const seconds = Number(candle.timestamp)
    const close = Number(candle.close)
    if (!Number.isInteger(seconds) || seconds <= 0) {
      skipped.push(`bad timestamp ${JSON.stringify(candle.timestamp)}`)
      continue
    }
    if (!isPlausibleEurUsd(close)) {
      skipped.push(
        `close ${JSON.stringify(candle.close)} at ${new Date(
          seconds * 1000
        ).toISOString()}`
      )
      continue
    }
    // Stamped at the candle's CLOSE, which is the instant the price describes.
    // A candle stamped at its open would place every point an hour before the
    // observation it carries.
    points.push({ ts: (seconds + OHLC_STEP_SECONDS) * 1000, price: close })
  }
  if (skipped.length > 0)
    log.warn(
      `[fx-price] skipped ${skipped.length} unusable candle(s): ${skipped
        .slice(0, 5)
        .join(', ')}`
    )
  if (points.length === 0)
    throw new Error('Bitstamp OHLC payload carried no usable candle')

  points.sort((a, b) => a.ts - b.ts)
  return points
}
