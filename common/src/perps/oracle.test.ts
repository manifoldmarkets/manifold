import {
  MAX_ORACLE_FUTURE_SKEW_MS,
  decideOracleTransition,
  getConsensusMedian,
  getOracleFreshness,
  getOracleLogPriceChange,
  normalizeOraclePointBatch,
  validateBasicOraclePoint,
} from './oracle'

const NOW = 2_000_000
const current = { ts: 1_000_000, price: 100 }

describe('getOracleFreshness', () => {
  it('is fresh through the configured boundary and stale immediately after', () => {
    expect(getOracleFreshness(1_000_000, 1_000_000, NOW)).toEqual({
      status: 'fresh',
      ageMs: 1_000_000,
    })
    expect(getOracleFreshness(999_999, 1_000_000, NOW)).toEqual({
      status: 'stale',
      ageMs: 1_000_001,
    })
  })

  it('treats a future point as age zero', () => {
    expect(getOracleFreshness(NOW + 1_000, 60_000, NOW)).toEqual({
      status: 'fresh',
      ageMs: 0,
    })
  })

  it.each([
    [undefined, 60_000, NOW],
    [0, 60_000, NOW],
    [Number.NaN, 60_000, NOW],
    [NOW, 0, NOW],
    [NOW, Number.POSITIVE_INFINITY, NOW],
    [NOW, 60_000, Number.NaN],
    [NOW + MAX_ORACLE_FUTURE_SKEW_MS + 1, 60_000, NOW],
  ])(
    'pauses on invalid freshness inputs %#',
    (oraclePriceTime, maxAgeMs, now) => {
      expect(getOracleFreshness(oraclePriceTime, maxAgeMs, now)).toEqual({
        status: 'unknown',
        ageMs: null,
      })
    }
  )
})

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
        {
          ts: NOW + MAX_ORACLE_FUTURE_SKEW_MS,
          price: 100,
          sourceTs: NOW + MAX_ORACLE_FUTURE_SKEW_MS,
        },
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
    [{ ts: NOW, price: 100, sourceTs: Number.NaN }, 'source timestamp'],
    [{ ts: NOW, price: 100, sourceTs: 0 }, 'source timestamp'],
    [
      {
        ts: NOW,
        price: 100,
        sourceTs: NOW + MAX_ORACLE_FUTURE_SKEW_MS + 1,
      },
      'source timestamp',
    ],
  ])('rejects an invalid point %#', (point, message) => {
    expect(validateBasicOraclePoint(point, NOW)).toContain(message)
  })
})

describe('normalizeOraclePointBatch', () => {
  it('sorts points and removes exact timestamp redelivery', () => {
    expect(
      normalizeOraclePointBatch([
        { ts: 3, price: 103 },
        { ts: 1, price: 101 },
        { ts: 2, price: 102 },
        { ts: 2, price: 102 },
      ])
    ).toEqual({
      ok: true,
      points: [
        { ts: 1, price: 101 },
        { ts: 2, price: 102 },
        { ts: 3, price: 103 },
      ],
    })
  })

  it('rejects a batch with two values for one immutable timestamp', () => {
    expect(
      normalizeOraclePointBatch([
        { ts: 2, price: 102 },
        { ts: 1, price: 101 },
        { ts: 2, price: 999 },
      ])
    ).toEqual(
      expect.objectContaining({
        ok: false,
        reason: expect.stringContaining('conflicting prices'),
      })
    )
  })

  it('enriches exact redelivery with source metadata deterministically', () => {
    const point = { ts: 2, price: 102, sourceTs: 1 }
    expect(
      normalizeOraclePointBatch([
        { ts: 2, price: 102 },
        point,
        { ts: 2, price: 102 },
      ])
    ).toEqual({ ok: true, points: [point] })
    expect(normalizeOraclePointBatch([point, { ts: 2, price: 102 }])).toEqual({
      ok: true,
      points: [point],
    })
  })

  it('rejects conflicting source metadata at one immutable timestamp', () => {
    expect(
      normalizeOraclePointBatch([
        { ts: 2, price: 102, sourceTs: 1 },
        { ts: 2, price: 102, sourceTs: 2 },
      ])
    ).toEqual(
      expect.objectContaining({
        ok: false,
        reason: expect.stringContaining('conflicting source timestamps'),
      })
    )
  })
})

describe('getConsensusMedian', () => {
  it('uses the median after two sources confirm the level', () => {
    expect(getConsensusMedian([100, 101, 10_000], 0.02)).toBe(101)
    expect(getConsensusMedian([100, 101], 0.02)).toBe(100.5)
  })

  it('rejects unconfirmed, invalid, or insufficient values', () => {
    expect(getConsensusMedian([100, 103, 107], 0.02)).toBeNull()
    expect(
      getConsensusMedian([Number.NaN, Number.POSITIVE_INFINITY, 100], 0.02)
    ).toBeNull()
    expect(getConsensusMedian([100, 101], 0)).toBeNull()
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

  it('applies source metadata once without allowing it to be erased', () => {
    const sourceTs = current.ts - 100
    expect(
      decideOracleTransition(current, { ...current, sourceTs }, NOW)
    ).toEqual({ action: 'apply' })
    expect(
      decideOracleTransition({ ...current, sourceTs }, { ...current }, NOW)
    ).toEqual({ action: 'ignore', reason: 'duplicate' })
  })

  it('rejects conflicting source metadata at one immutable timestamp', () => {
    expect(
      decideOracleTransition(
        { ...current, sourceTs: current.ts - 100 },
        { ...current, sourceTs: current.ts - 50 },
        NOW
      )
    ).toEqual(
      expect.objectContaining({
        action: 'reject',
        reason: expect.stringContaining('source timestamp'),
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
