import { DAY_MS, HOUR_MS, MINUTE_MS } from '../util/time'
import {
  FUNDING_PERIOD_MS,
  fundingPeriodNoun,
  fundingPeriodUnit,
  getFundingPeriodMs,
  shouldApplyFunding,
} from './funding'

describe('getFundingPeriodMs', () => {
  it('defaults legacy contracts (no field) to hourly', () => {
    expect(getFundingPeriodMs({})).toBe(HOUR_MS)
    expect(getFundingPeriodMs({ fundingPeriodMs: undefined })).toBe(HOUR_MS)
  })

  it('returns the frozen per-contract period', () => {
    expect(getFundingPeriodMs({ fundingPeriodMs: DAY_MS })).toBe(DAY_MS)
    expect(getFundingPeriodMs({ fundingPeriodMs: HOUR_MS })).toBe(HOUR_MS)
  })

  it('falls back on sub-hour or garbage values — the scheduler cannot honour them', () => {
    expect(getFundingPeriodMs({ fundingPeriodMs: 0 })).toBe(HOUR_MS)
    expect(getFundingPeriodMs({ fundingPeriodMs: 30 * MINUTE_MS })).toBe(
      HOUR_MS
    )
    expect(getFundingPeriodMs({ fundingPeriodMs: NaN })).toBe(HOUR_MS)
    expect(getFundingPeriodMs({ fundingPeriodMs: -DAY_MS })).toBe(HOUR_MS)
  })
})

describe('shouldApplyFunding', () => {
  // An exact hour boundary for readable arithmetic.
  const H0 = Math.floor(1_700_000_000_000 / HOUR_MS) * HOUR_MS

  const base = {
    now: H0 + 24 * HOUR_MS,
    lastFundingTime: H0,
    latestOracleTime: H0 + 23 * HOUR_MS,
    fundingPeriodMs: DAY_MS,
  }

  it('fires the first funding unconditionally', () => {
    expect(
      shouldApplyFunding({ ...base, lastFundingTime: undefined })
    ).toBe(true)
    expect(shouldApplyFunding({ ...base, lastFundingTime: 0 })).toBe(true)
  })

  it('period gate: blocks until period minus one minute of slack has elapsed', () => {
    expect(
      shouldApplyFunding({ ...base, now: H0 + 23 * HOUR_MS })
    ).toBe(false)
    expect(
      shouldApplyFunding({ ...base, now: H0 + DAY_MS - 2 * MINUTE_MS })
    ).toBe(false)
    expect(
      shouldApplyFunding({ ...base, now: H0 + DAY_MS - 30_000 })
    ).toBe(true)
  })

  it('reproduces the live cron-jitter case that motivated the slack (846752c7d)', () => {
    // Event committed at 16:00:01.104; next run started 17:00:00.822 —
    // elapsed 3,599,780ms, under a full hour. Must still fund.
    const event = H0 + 1_104
    const run = H0 + HOUR_MS + 822
    expect(
      shouldApplyFunding({
        now: run,
        lastFundingTime: event,
        latestOracleTime: run - 10_000,
        fundingPeriodMs: HOUR_MS,
      })
    ).toBe(true)
  })

  it('oracle anchor: no new price since the last funding means no funding', () => {
    // Daily feed's job failed: latest price predates the last funding event.
    expect(
      shouldApplyFunding({
        ...base,
        latestOracleTime: H0 - 2 * HOUR_MS,
      })
    ).toBe(false)
    // Feed recovers: next run funds.
    expect(
      shouldApplyFunding({
        ...base,
        now: H0 + 25 * HOUR_MS,
        latestOracleTime: H0 + 24.5 * HOUR_MS,
      })
    ).toBe(true)
  })

  it('hourly periods are exempt from the oracle anchor — timestamp minutiae must never skip funding', () => {
    // The anchor kills the PREDICTABLE dodge, which cannot exist when the
    // period equals the scheduler's funding cadence: every hourly period
    // contains expected price movement. A NESO block stamped 17:00:00.000
    // against an event stamped 17:00:00.822 (or an hour-late feed) is
    // timing noise, not a dodge — funding fires regardless.
    const fundingEvent = H0 + 822
    expect(
      shouldApplyFunding({
        now: H0 + HOUR_MS + 800,
        lastFundingTime: fundingEvent,
        latestOracleTime: H0, // block "to" = the boundary itself
        fundingPeriodMs: HOUR_MS,
      })
    ).toBe(true)
    expect(
      shouldApplyFunding({
        now: H0 + HOUR_MS + 800,
        lastFundingTime: fundingEvent,
        latestOracleTime: H0 - 3 * HOUR_MS, // even a stalled feed
        fundingPeriodMs: HOUR_MS,
      })
    ).toBe(true)
  })

  it('slow periods use a strict anchor: a value stamped just before the last funding does not count', () => {
    // Daily write landed seconds before yesterday's funding fired, nothing
    // since — the feed produced nothing all period. The normal case has
    // ~23h of margin, so strictness costs nothing there.
    expect(
      shouldApplyFunding({
        ...base,
        latestOracleTime: base.lastFundingTime - 15_000,
      })
    ).toBe(false)
  })

  it('fast feeds behave as before: fresh price every tick, period gate does the work', () => {
    const now = H0 + HOUR_MS + 500
    expect(
      shouldApplyFunding({
        now,
        lastFundingTime: H0 + 1_000,
        latestOracleTime: now - 15_000,
        fundingPeriodMs: HOUR_MS,
      })
    ).toBe(true)
  })

  it('fails closed on garbage', () => {
    expect(shouldApplyFunding({ ...base, now: NaN })).toBe(false)
    expect(shouldApplyFunding({ ...base, fundingPeriodMs: NaN })).toBe(false)
    expect(shouldApplyFunding({ ...base, fundingPeriodMs: 0 })).toBe(false)
    expect(
      shouldApplyFunding({ ...base, latestOracleTime: undefined })
    ).toBe(false)
  })

  it('exports the hourly default', () => {
    expect(FUNDING_PERIOD_MS).toBe(HOUR_MS)
  })
})

describe('funding period labels', () => {
  it('names the two real cadences and degrades sensibly', () => {
    expect(fundingPeriodUnit(HOUR_MS)).toBe('hr')
    expect(fundingPeriodUnit(DAY_MS)).toBe('day')
    expect(fundingPeriodUnit(4 * HOUR_MS)).toBe('4h')
    expect(fundingPeriodNoun(HOUR_MS)).toBe('hour')
    expect(fundingPeriodNoun(DAY_MS)).toBe('day')
    expect(fundingPeriodNoun(4 * HOUR_MS)).toBe('4 hours')
  })
})
