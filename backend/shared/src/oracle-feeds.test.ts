import {
  getMinTradingMarkAgeMs,
  MIN_MARK_AGE_UPDATE_PERIODS,
  ORACLE_FEEDS,
} from './oracle-feeds'

describe('getMinTradingMarkAgeMs', () => {
  it('never floors tighter than the previous staleAfterMs rule', () => {
    // The safety property of this change. The floor used to be staleAfterMs
    // outright, so anything at or above it validated. Taking a MIN can only
    // lower the bar, which means no market that could be created or edited
    // before can be rejected now — the change is a pure relaxation.
    for (const feed of ORACLE_FEEDS) {
      expect(getMinTradingMarkAgeMs(feed)).toBeLessThanOrEqual(
        feed.staleAfterMs
      )
    }
  })

  it('never floors below what the feed can actually deliver', () => {
    // The other direction: a gate tighter than a couple of update periods
    // would pause the market between perfectly healthy ticks, which is the
    // failure the old staleAfterMs floor was reaching for.
    for (const feed of ORACLE_FEEDS) {
      expect(getMinTradingMarkAgeMs(feed)).toBeGreaterThanOrEqual(
        Math.min(
          feed.staleAfterMs,
          MIN_MARK_AGE_UPDATE_PERIODS * feed.updatePeriodMs
        )
      )
      expect(getMinTradingMarkAgeMs(feed)).toBeGreaterThan(feed.updatePeriodMs)
    }
  })

  it('lets the BTC feed be gated at 10s', () => {
    // The reason this exists. On a 2s feed the old floor was staleAfterMs =
    // 120s, i.e. 60 missed ticks of permitted staleness — the window latency
    // bots were paid out of. A 10s gate must now be configurable.
    const btc = ORACLE_FEEDS.find((f) => f.id === 'btc-usd')
    expect(btc).toBeDefined()
    if (!btc) return
    expect(btc.staleAfterMs).toBe(120_000)
    expect(getMinTradingMarkAgeMs(btc)).toBeLessThanOrEqual(10_000)
  })

  it('leaves slow feeds on their alerting threshold', () => {
    // Daily and hourly feeds update far less often than their staleness
    // threshold, so the MIN keeps them exactly where they were.
    for (const feed of ORACLE_FEEDS) {
      if (
        MIN_MARK_AGE_UPDATE_PERIODS * feed.updatePeriodMs >=
        feed.staleAfterMs
      )
        expect(getMinTradingMarkAgeMs(feed)).toBe(feed.staleAfterMs)
    }
  })
})
