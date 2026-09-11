import { getOracleAttribution } from 'common/perps/oracle-attribution'
import { ORACLE_TICK_DECORATIONS } from 'common/perps/oracle-display'
import { getPerpFeedTicker } from 'common/perps/ticker'
import { MINUTE_MS } from 'common/util/time'

import { getEurUsdConsensusRate } from './fx-price'
import { EUR_USD_FEED_ID } from './oracle'
import {
  ORACLE_FEEDS,
  getMinTradingMarkAgeMs,
  getOracleFeed,
} from './oracle-feeds'
import { getPerpLaunchManifestErrors } from './perps/launch-manifest'

// Wiring and consensus behaviour for the `eur-usd` feed. A missing entry is a
// red build rather than a runtime surprise.
describe('eur-usd feed wiring', () => {
  const id = EUR_USD_FEED_ID

  it('is registered as a fast feed with bounds covering the euro’s history', () => {
    const feed = getOracleFeed(id)
    expect(feed?.cadence).toBe('fast')
    expect(feed?.marketCreationEnabled).toBe(true)
    // Roughly 0.82-1.60 is the euro's lifetime range; the band has to contain
    // it with room, so it only ever catches unit confusion.
    expect(feed?.minPrice).toBe(0.5)
    expect(feed?.maxPrice).toBe(2)
    expect(feed?.staleAfterMs).toBe(2 * MINUTE_MS)
  })

  it('polls on a whole number of oracle ticks', () => {
    // A pollPeriodMs that is not a multiple of the 2s tick silently runs at a
    // different rate than the registry claims (validateOracleFeedPollPeriods
    // logs it at boot; this catches it at build time).
    const feed = getOracleFeed(id)
    expect(feed?.pollPeriodMs).toBe(10_000)
    expect((feed?.pollPeriodMs ?? 0) % 2_000).toBe(0)
  })

  it('stays inside Kraken’s public rate limit alongside btc-usd', () => {
    // The real constraint on this feed's poll rate. btc-usd polls Kraken every
    // 2s; Kraken's public limit is ~1 req/s. Both feeds together must stay
    // under that, or a rate-limited Kraken degrades the launch-critical feed.
    const btc = getOracleFeed('btc-usd')
    const fx = getOracleFeed(id)
    const krakenRequestsPerSecond =
      1_000 / (btc?.pollPeriodMs ?? 1) + 1_000 / (fx?.pollPeriodMs ?? 1)
    expect(krakenRequestsPerSecond).toBeLessThan(1)
  })

  it('lets a market gate on a mark no older than 20s', () => {
    // Two update periods. The point of a tight gate on a continuously quoted
    // feed is that the window between polls is the window a latency bot trades.
    const feed = getOracleFeed(id)
    expect(feed).toBeDefined()
    if (!feed) return
    expect(getMinTradingMarkAgeMs(feed)).toBe(20_000)
  })

  it('credits the venues without claiming a licence', () => {
    // Same stance as btc-usd: the published number is a median we compute from
    // public keyless tickers, so nothing is republished under anyone's terms.
    const attribution = getOracleAttribution(id)
    expect(attribution?.source).toBe('Bitstamp, Coinbase & Kraken')
    expect(attribution?.licence).toBeUndefined()
    expect(attribution?.licenceUrl).toBeUndefined()
    expect(attribution?.showAsOf).toBeUndefined()
  })

  it('renders as dollars per euro and has a ticker', () => {
    expect(ORACLE_TICK_DECORATIONS[id]).toEqual({ prefix: '$' })
    expect(getPerpFeedTicker(id)).toBe('EURUSD')
  })

  it('does not disturb the launch manifest', () => {
    // Deliberately not a launch market: the manifest is the curated public set,
    // and a registry feed that is merely creatable must not break its checks.
    expect(getPerpLaunchManifestErrors()).toEqual([])
    expect(ORACLE_FEEDS.filter((feed) => feed.id === id)).toHaveLength(1)
  })
})

describe('getEurUsdConsensusRate', () => {
  const quote = (source: string, rate: number) => ({ source, rate })

  it('takes the median of venues that agree', () => {
    expect(
      getEurUsdConsensusRate([
        quote('bitstamp', 1.1631),
        quote('coinbase', 1.1633),
        quote('kraken', 1.1635),
      ])
    ).toBe(1.1633)
  })

  it('ignores one venue that has come off the rails', () => {
    expect(
      getEurUsdConsensusRate([
        quote('bitstamp', 1.1631),
        quote('coinbase', 1.1633),
        quote('kraken', 1.32),
      ])
    ).toBeCloseTo(1.1632, 10)
  })

  it('publishes nothing when no two venues agree', () => {
    // 30 pips apart is outside the 0.2% tolerance — far too wide for EUR/USD
    // to be one market, so there is no level to publish.
    expect(
      getEurUsdConsensusRate([
        quote('bitstamp', 1.16),
        quote('coinbase', 1.166),
        quote('kraken', 1.172),
      ])
    ).toBeNull()
  })

  it('publishes nothing on a single quote', () => {
    expect(getEurUsdConsensusRate([quote('bitstamp', 1.1633)])).toBeNull()
  })

  it('rejects an inverted venue instead of averaging it in', () => {
    // The corruption mode the registry's bounds cannot catch: 1/1.1634 is a
    // plausible rate on its own, and only disagreement reveals it.
    expect(
      getEurUsdConsensusRate([
        quote('bitstamp', 1.1631),
        quote('coinbase', 1.1633),
        quote('kraken', 1 / 1.1634),
      ])
    ).toBeCloseTo(1.1632, 10)
  })

  it('is tighter than BTC’s tolerance by two orders of magnitude', () => {
    // 2% of EUR/USD is 230 pips — four times a normal day's entire range — so
    // BTC's tolerance here would corroborate garbage. Pinned as a regression
    // guard against someone widening it to quiet the "no venue agreed" log.
    expect(
      getEurUsdConsensusRate([quote('a', 1.16), quote('b', 1.18)])
    ).toBeNull()
  })
})
