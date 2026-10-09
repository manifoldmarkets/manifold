import { DAY_MS, HOUR_MS, MINUTE_MS } from '../util/time'
import {
  getPerpPollCadence,
  isSlowPerpFeed,
  PERP_FAST_META_POLL_MS,
  PERP_FAST_QUOTE_POLL_MS,
  PERP_SLOW_FEED_POLL_MS,
} from './poll-cadence'

// The VoteHub shape matches the live midterms-page contracts on 2026-10-06; the
// fast ones follow the launch manifest's recommended settings.
const btc = { fundingPeriodMs: HOUR_MS, maxOraclePriceAgeMs: 2 * MINUTE_MS }
const xStock = { fundingPeriodMs: HOUR_MS, maxOraclePriceAgeMs: 5 * MINUTE_MS }
const voteHub = { fundingPeriodMs: DAY_MS, maxOraclePriceAgeMs: 30 * HOUR_MS }

describe('isSlowPerpFeed', () => {
  it('treats fast feeds as fast', () => {
    expect(isSlowPerpFeed(btc)).toBe(false)
    expect(isSlowPerpFeed(xStock)).toBe(false)
  })

  it('treats a feed whose funding period was stretched past an hour as slow', () => {
    expect(isSlowPerpFeed(voteHub)).toBe(true)
    expect(isSlowPerpFeed({ fundingPeriodMs: 2 * HOUR_MS })).toBe(true)
  })

  it('falls back to the price-age budget on contracts without a funding period', () => {
    expect(isSlowPerpFeed({ maxOraclePriceAgeMs: 30 * HOUR_MS })).toBe(true)
    expect(isSlowPerpFeed({ maxOraclePriceAgeMs: 3 * HOUR_MS })).toBe(true)
    expect(isSlowPerpFeed({ maxOraclePriceAgeMs: 2 * MINUTE_MS })).toBe(false)
  })

  it('defaults to fast when the contract says nothing usable', () => {
    // Fast is the safe default: it is the pre-existing behavior.
    expect(isSlowPerpFeed({})).toBe(false)
    expect(isSlowPerpFeed({ fundingPeriodMs: NaN })).toBe(false)
    expect(isSlowPerpFeed({ maxOraclePriceAgeMs: Infinity })).toBe(false)
    expect(
      isSlowPerpFeed({ fundingPeriodMs: -1, maxOraclePriceAgeMs: -1 })
    ).toBe(false)
  })
})

describe('getPerpPollCadence', () => {
  it('leaves fast feeds on the trading cadence, even on display-only cards', () => {
    const fast = {
      quoteFallbackMs: PERP_FAST_QUOTE_POLL_MS,
      metaMs: PERP_FAST_META_POLL_MS,
    }
    expect(getPerpPollCadence(btc)).toEqual(fast)
    expect(getPerpPollCadence(btc, { displayOnly: true })).toEqual(fast)
  })

  it('backs the quote fallback off to a minute on slow-feed trading surfaces', () => {
    expect(getPerpPollCadence(voteHub)).toEqual({
      quoteFallbackMs: PERP_SLOW_FEED_POLL_MS,
      // The trade panel reads live leverage/fee config and pools from meta.
      metaMs: PERP_FAST_META_POLL_MS,
    })
    expect(PERP_SLOW_FEED_POLL_MS).toBeGreaterThanOrEqual(MINUTE_MS)
  })

  it('drops the uncached quote poll on display-only slow-feed cards', () => {
    // The price comes from the push and the edge-cached meta poll instead.
    expect(getPerpPollCadence(voteHub, { displayOnly: true })).toEqual({
      quoteFallbackMs: null,
      metaMs: PERP_SLOW_FEED_POLL_MS,
    })
  })
})
