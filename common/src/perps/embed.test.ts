import { DAY_MS, HOUR_MS, YEAR_MS } from '../util/time'
import { PerpEmbedContract, getPerpEmbedSummary } from './embed'

const NOW = 1_700_000_000_000

const getContract = (
  overrides: Partial<PerpEmbedContract> = {}
): PerpEmbedContract => ({
  fundingPeriodMs: HOUR_MS,
  fundingSensitivity: 1,
  isResolved: false,
  maxFundingRate: 0.001,
  maxLeverage: 3,
  maxOraclePriceAgeMs: 60_000,
  oraclePrice: 100,
  oraclePriceTime: NOW - 1_000,
  poolLong: 60_000,
  poolShort: 40_000,
  resolution: undefined,
  resolvedOraclePrice: undefined,
  ...overrides,
})

describe('getPerpEmbedSummary', () => {
  it('shows a fresh market as tradeable with live pool-derived funding', () => {
    const summary = getPerpEmbedSummary(getContract(), NOW)

    expect(summary.status).toBe('live')
    expect(summary.canTrade).toBe(true)
    expect(summary.displayPrice).toBe(100)
    expect(summary.priceLabel).toBe('Oracle price')
    expect(summary.backingPool).toBe(100_000)
    expect(summary.maxLeverage).toBe(3)
    expect(summary.funding?.payer).toBe('longs')
    expect(summary.funding?.rate).toBeCloseTo(1 / 3_000)
    expect(summary.funding?.annualizedRate).toBeCloseTo(
      (1 / 3_000) * (YEAR_MS / HOUR_MS)
    )
  })

  it('uses the contract funding period when annualizing', () => {
    const summary = getPerpEmbedSummary(
      getContract({ fundingPeriodMs: DAY_MS }),
      NOW
    )

    expect(summary.funding?.periodMs).toBe(DAY_MS)
    expect(summary.funding?.annualizedRate).toBeCloseTo(
      (1 / 3_000) * (YEAR_MS / DAY_MS)
    )
  })

  it('fails closed for stale and unavailable oracle timestamps', () => {
    const stale = getPerpEmbedSummary(
      getContract({ oraclePriceTime: NOW - 60_001 }),
      NOW
    )
    const unavailable = getPerpEmbedSummary(
      getContract({ oraclePriceTime: undefined }),
      NOW
    )

    expect(stale.status).toBe('stale')
    expect(stale.canTrade).toBe(false)
    expect(unavailable.status).toBe('unavailable')
    expect(unavailable.canTrade).toBe(false)
  })

  it('honors the explicit development freshness bypass', () => {
    const summary = getPerpEmbedSummary(
      getContract({ oraclePriceTime: undefined }),
      NOW,
      true
    )

    expect(summary.status).toBe('live')
    expect(summary.canTrade).toBe(true)
  })

  it('uses the final oracle price and removes funding after settlement', () => {
    const summary = getPerpEmbedSummary(
      getContract({
        isResolved: true,
        resolution: 'MKT',
        oraclePrice: 99,
        resolvedOraclePrice: 101.5,
      }),
      NOW
    )

    expect(summary.status).toBe('settled')
    expect(summary.canTrade).toBe(false)
    expect(summary.displayPrice).toBe(101.5)
    expect(summary.priceLabel).toBe('Final oracle price')
    expect(summary.funding).toBeNull()
  })

  it('labels cancelled markets without presenting their last price as final', () => {
    const summary = getPerpEmbedSummary(
      getContract({
        isResolved: true,
        resolution: 'CANCEL',
        oraclePrice: 99,
        resolvedOraclePrice: 101.5,
      }),
      NOW
    )

    expect(summary.status).toBe('cancelled')
    expect(summary.canTrade).toBe(false)
    expect(summary.displayPrice).toBe(99)
    expect(summary.priceLabel).toBe('Last oracle price')
    expect(summary.funding).toBeNull()
  })

  it('defensively removes invalid backing, leverage, and annualized values', () => {
    const summary = getPerpEmbedSummary(
      getContract({
        fundingPeriodMs: Number.POSITIVE_INFINITY,
        maxLeverage: Number.NaN,
        poolLong: Number.NaN,
      }),
      NOW
    )

    expect(summary.backingPool).toBe(0)
    expect(summary.maxLeverage).toBeNull()
    expect(summary.funding?.rate).toBe(0)
    expect(summary.funding?.annualizedRate).toBe(0)
  })
})
