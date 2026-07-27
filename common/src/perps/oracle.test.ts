import {
  MAX_ORACLE_FUTURE_SKEW_MS,
  decideOracleTransition,
  getOracleLogPriceChange,
  validateBasicOraclePoint,
} from './oracle'

const NOW = 2_000_000
const current = { ts: 1_000_000, price: 100 }

describe('getOracleLogPriceChange', () => {
  it('measures endpoint movement independently of the feed scale', () => {
    expect(getOracleLogPriceChange(110, 100)).toBeCloseTo(Math.log(1.1), 12)
    expect(getOracleLogPriceChange(110_000, 100_000)).toBeCloseTo(
      Math.log(1.1),
      12
    )
    expect(getOracleLogPriceChange(100, 110)).toBeCloseTo(Math.log(1.1), 12)
    expect(getOracleLogPriceChange(100, 100)).toBe(0)
  })

  it('returns zero for invalid persisted prices', () => {
    expect(getOracleLogPriceChange(Number.NaN, 100)).toBe(0)
    expect(getOracleLogPriceChange(100, Number.POSITIVE_INFINITY)).toBe(0)
    expect(getOracleLogPriceChange(0, 100)).toBe(0)
    expect(getOracleLogPriceChange(100, -1)).toBe(0)
  })
})

describe('validateBasicOraclePoint', () => {
  it('accepts a finite positive point within the clock-skew allowance', () => {
    expect(
      validateBasicOraclePoint(
        { ts: NOW + MAX_ORACLE_FUTURE_SKEW_MS, price: 100 },
        NOW
      )
    ).toBeNull()
  })

  it.each([
    [{ ts: Number.NaN, price: 100 }, 'invalid timestamp'],
    [{ ts: 0, price: 100 }, 'invalid timestamp'],
    [{ ts: NOW + MAX_ORACLE_FUTURE_SKEW_MS + 1, price: 100 }, 'in the future'],
    [{ ts: NOW, price: Number.POSITIVE_INFINITY }, 'non-positive price'],
    [{ ts: NOW, price: 0 }, 'non-positive price'],
  ])('rejects an invalid point %#', (point, message) => {
    expect(validateBasicOraclePoint(point, NOW)).toContain(message)
  })
})

describe('decideOracleTransition', () => {
  it('applies a newer point or the first point', () => {
    expect(
      decideOracleTransition(current, { ts: current.ts + 1, price: 101 }, NOW)
    ).toEqual({ action: 'apply' })
    expect(decideOracleTransition(null, current, NOW)).toEqual({
      action: 'apply',
    })
  })

  it('ignores stale and exact duplicate delivery', () => {
    expect(
      decideOracleTransition(current, { ts: current.ts - 1, price: 99 }, NOW)
    ).toEqual({ action: 'ignore', reason: 'stale' })
    expect(decideOracleTransition(current, current, NOW)).toEqual({
      action: 'ignore',
      reason: 'duplicate',
    })
  })

  it('rejects conflicting values at one immutable timestamp', () => {
    expect(
      decideOracleTransition(current, { ...current, price: 101 }, NOW)
    ).toEqual(
      expect.objectContaining({
        action: 'reject',
        reason: expect.stringContaining('conflicts'),
      })
    )
  })

  it('rejects invalid incoming or cached points', () => {
    expect(
      decideOracleTransition(
        current,
        { ts: NOW + MAX_ORACLE_FUTURE_SKEW_MS + 1, price: 101 },
        NOW
      )
    ).toEqual(
      expect.objectContaining({
        action: 'reject',
        reason: expect.stringContaining('in the future'),
      })
    )
    expect(
      decideOracleTransition(
        { ts: current.ts, price: Number.NaN },
        current,
        NOW
      )
    ).toEqual(
      expect.objectContaining({
        action: 'reject',
        reason: expect.stringContaining('current oracle point is invalid'),
      })
    )
  })
})
