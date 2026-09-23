import {
  DAILY_FEED_HEARTBEAT_MS,
  decideDailyFeedPublish,
} from './daily-feed-publish'
import {
  TRUMP_APPROVAL_HEARTBEAT_MS,
  decideApprovalPublish,
} from './trump-approval'

// The publish-on-change rule shared by every slow feed. The Trump test file
// exercises it through decideApprovalPublish; these pin that the generic
// rule is that same function and that an integer-valued source (Fear &
// Greed) and a one-decimal source (VoteHub) both trip on their own smallest
// move.
describe('decideDailyFeedPublish', () => {
  const now = Date.parse('2026-09-02T12:00:00Z')

  it('is the rule the Trump feed has always used', () => {
    expect(TRUMP_APPROVAL_HEARTBEAT_MS).toBe(DAILY_FEED_HEARTBEAT_MS)
    const last = { price: 38.4, ts: now - 60_000 }
    for (const price of [38.4, 38.5])
      expect(decideApprovalPublish({ price, last, now })).toEqual(
        decideDailyFeedPublish({ price, last, now })
      )
  })

  it('publishes first, on change, and on heartbeat — and otherwise not', () => {
    expect(decideDailyFeedPublish({ price: 52, last: null, now })).toEqual({
      publish: true,
      reason: 'first',
    })
    expect(
      decideDailyFeedPublish({
        price: 53,
        last: { price: 52, ts: now - 1000 },
        now,
      })
    ).toEqual({ publish: true, reason: 'changed' })
    expect(
      decideDailyFeedPublish({
        price: 52,
        last: { price: 52, ts: now - DAILY_FEED_HEARTBEAT_MS },
        now,
      })
    ).toEqual({ publish: true, reason: 'heartbeat' })
    const held = decideDailyFeedPublish({
      price: 52,
      last: { price: 52, ts: now - DAILY_FEED_HEARTBEAT_MS + 1 },
      now,
    })
    expect(held.publish).toBe(false)
    expect(held.reason).toContain('unchanged')
  })

  it('keeps the heartbeat inside every daily feed staleness bound', () => {
    // 26h staleAfterMs on the daily feeds, 30h maxOraclePriceAgeMs on their
    // markets; two heartbeats a day leaves real margin under both.
    expect(DAILY_FEED_HEARTBEAT_MS).toBeLessThan(26 * 60 * 60 * 1000)
  })

  it('honours a per-feed heartbeat override', () => {
    const last = { price: 52, ts: now - 2 * 60 * 60 * 1000 }
    expect(
      decideDailyFeedPublish({
        price: 52,
        last,
        now,
        heartbeatMs: 60 * 60 * 1000,
      }).publish
    ).toBe(true)
    expect(
      decideDailyFeedPublish({ price: 52, last, now, heartbeatMs: 0 }).publish
    ).toBe(false)
  })

  it('refuses garbage rather than publishing it', () => {
    expect(
      decideDailyFeedPublish({ price: NaN, last: null, now }).publish
    ).toBe(false)
    expect(
      decideDailyFeedPublish({ price: 52, last: null, now: NaN }).publish
    ).toBe(false)
    // A corrupt prior point is no prior point.
    expect(
      decideDailyFeedPublish({ price: 52, last: { price: NaN, ts: now }, now })
    ).toEqual({ publish: true, reason: 'first' })
  })
})
