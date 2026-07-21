import {
  applyFunding,
  computeFundingRate,
  getPositionValue,
} from './amm'
import {
  carryNeutralPath,
  clusterLiquidationBands,
  FUNDING_PERIOD_MS,
  gapThresholdMs,
  personalBreakEvenPath,
  projectionHorizonMs,
  realizedVolPerSqrtMs,
  volConePaths,
} from './chart-projections'
import { PerpPosition } from './position'

const NOW = 1_700_000_000_000

describe('projectionHorizonMs', () => {
  it('scales with history span, floored at 30 minutes', () => {
    const tenDays = 10 * 24 * FUNDING_PERIOD_MS
    expect(projectionHorizonMs(tenDays)).toBeCloseTo(tenDays * 0.28)
    // 0.28 × 90min ≈ 25min — below the floor, and the 90min span allows it.
    expect(projectionHorizonMs(90 * 60 * 1000)).toBe(30 * 60 * 1000)
  })

  it('never projects further ahead than the visible history', () => {
    expect(projectionHorizonMs(FUNDING_PERIOD_MS)).toBe(30 * 60 * 1000)
    expect(projectionHorizonMs(10 * 60 * 1000)).toBe(10 * 60 * 1000)
  })

  it('caps at a year and survives garbage input', () => {
    const tenYears = 3650 * 24 * FUNDING_PERIOD_MS
    expect(projectionHorizonMs(tenYears)).toBe(365 * 24 * FUNDING_PERIOD_MS)
    expect(projectionHorizonMs(NaN)).toBe(2 * FUNDING_PERIOD_MS)
    expect(projectionHorizonMs(-5)).toBe(2 * FUNDING_PERIOD_MS)
  })
})

describe('carryNeutralPath', () => {
  it('slopes up when longs pay and down when shorts pay', () => {
    const horizon = 10 * FUNDING_PERIOD_MS
    const up = carryNeutralPath(100, 0.001, NOW, horizon)
    expect(up).toHaveLength(2)
    expect(up[1].value).toBeCloseTo(100 * (1 + 0.001 * 10))
    const down = carryNeutralPath(100, -0.001, NOW, horizon)
    expect(down[1].value).toBeCloseTo(100 * (1 - 0.001 * 10))
  })

  it('is flat at zero funding and empty on invalid input', () => {
    const flat = carryNeutralPath(100, 0, NOW, FUNDING_PERIOD_MS)
    expect(flat[0].value).toBe(flat[1].value)
    expect(carryNeutralPath(0, 0.001, NOW, FUNDING_PERIOD_MS)).toEqual([])
    expect(carryNeutralPath(NaN, 0.001, NOW, FUNDING_PERIOD_MS)).toEqual([])
    expect(carryNeutralPath(100, NaN, NOW, FUNDING_PERIOD_MS)).toEqual([])
    expect(carryNeutralPath(100, 0.001, NOW, 0)).toEqual([])
  })
})

describe('realizedVolPerSqrtMs', () => {
  it('returns 0 for a constant series and null for thin data', () => {
    const flat = Array.from({ length: 20 }, (_, i) => ({
      ts: NOW + i * 1000,
      value: 50,
    }))
    expect(realizedVolPerSqrtMs(flat)).toBe(0)
    expect(realizedVolPerSqrtMs(flat.slice(0, 5))).toBeNull()
  })

  it('recovers a known per-ms volatility from regular log returns', () => {
    // Alternating ±r log returns at 1s spacing: variance per ms = r² / 1000.
    const r = 0.01
    const points = [{ ts: 0, value: 100 }]
    for (let i = 1; i <= 40; i++) {
      const prev = points[i - 1]
      points.push({
        ts: i * 1000,
        value: prev.value * Math.exp(i % 2 === 0 ? -r : r),
      })
    }
    const sigma = realizedVolPerSqrtMs(points)
    expect(sigma).not.toBeNull()
    expect(sigma!).toBeCloseTo(Math.sqrt((r * r) / 1000), 10)
  })

  it('excludes returns spanning longer than maxGapMs', () => {
    // 20 flat points at 1s cadence, then a 4-day outage, then a big jump.
    const points = Array.from({ length: 20 }, (_, i) => ({
      ts: i * 1000,
      value: 100,
    }))
    points.push({ ts: 20_000 + 4 * 24 * 3600 * 1000, value: 150 })
    expect(realizedVolPerSqrtMs(points)).toBeGreaterThan(0)
    expect(realizedVolPerSqrtMs(points, 60_000)).toBe(0)
  })

  it('skips zero/negative prices and non-positive intervals', () => {
    const points = [
      { ts: 0, value: 100 },
      { ts: 1000, value: 0 }, // bad price — skipped both sides
      { ts: 1000, value: 101 }, // dt = 0 — skipped
      ...Array.from({ length: 12 }, (_, i) => ({
        ts: 2000 + i * 1000,
        value: 101,
      })),
    ]
    expect(realizedVolPerSqrtMs(points)).toBe(0)
  })
})

describe('gapThresholdMs', () => {
  const series = (dts: number[]) => {
    const pts = [{ ts: 0 }]
    for (const dt of dts) pts.push({ ts: pts[pts.length - 1].ts + dt })
    return pts
  }

  it('floors at 3 hours so mixed 15s/hourly density stays connected', () => {
    const fifteenSec = series(Array.from({ length: 50 }, () => 15_000))
    expect(gapThresholdMs(fifteenSec)).toBe(3 * 3600 * 1000)
  })

  it('scales to 12x median for slow feeds', () => {
    const daily = series(Array.from({ length: 10 }, () => 24 * 3600 * 1000))
    expect(gapThresholdMs(daily)).toBe(12 * 24 * 3600 * 1000)
  })

  it('returns Infinity when there are no intervals', () => {
    expect(gapThresholdMs([{ ts: 0 }])).toBe(Infinity)
    expect(gapThresholdMs([])).toBe(Infinity)
  })
})

describe('volConePaths', () => {
  it('is multiplicatively symmetric and widens as sqrt of time', () => {
    const sigma = 1e-4
    const horizon = 4 * FUNDING_PERIOD_MS
    const cone = volConePaths(100, sigma, NOW, horizon, 4)
    expect(cone).not.toBeNull()
    const { upper, lower } = cone!
    expect(upper[0].value).toBe(100)
    expect(lower[0].value).toBe(100)
    for (let i = 0; i < upper.length; i++) {
      expect(upper[i].value * lower[i].value).toBeCloseTo(100 * 100, 6)
    }
    // log-width at 4H should be exactly 2× the log-width at H (√4 = 2).
    const w1 = Math.log(upper[1].value / 100)
    const w4 = Math.log(upper[4].value / 100)
    expect(w4).toBeCloseTo(2 * w1, 10)
  })

  it('rejects invalid inputs', () => {
    expect(volConePaths(0, 1e-4, NOW, FUNDING_PERIOD_MS)).toBeNull()
    expect(volConePaths(100, -1, NOW, FUNDING_PERIOD_MS)).toBeNull()
    expect(volConePaths(100, NaN, NOW, FUNDING_PERIOD_MS)).toBeNull()
    expect(volConePaths(100, 1e-4, NOW, 0)).toBeNull()
  })
})

describe('clusterLiquidationBands', () => {
  it('merges nearby liq prices, weighted by notional', () => {
    const bands = clusterLiquidationBands(
      [
        { size: 3000, liquidationPrice: 99 },
        { size: 1000, liquidationPrice: 100 },
        { size: 500, liquidationPrice: 120 },
        { size: 0, liquidationPrice: 50 }, // closed — ignored
      ],
      2
    )
    expect(bands).toHaveLength(2)
    // Weighted center of the merged band: (99·3000 + 100·1000) / 4000.
    expect(bands[0].price).toBeCloseTo(99.25)
    expect(bands[0].notional).toBe(4000)
    expect(bands[0].weight).toBeCloseTo(4000 / 4500)
    expect(bands[1].price).toBe(120)
    expect(bands.reduce((s, b) => s + b.weight, 0)).toBeCloseTo(1)
  })

  it('returns empty for no open positions or invalid liq prices', () => {
    expect(clusterLiquidationBands([], 1)).toEqual([])
    expect(
      clusterLiquidationBands([{ size: 100, liquidationPrice: NaN }], 1)
    ).toEqual([])
    expect(
      clusterLiquidationBands([{ size: 100, liquidationPrice: 0 }], 1)
    ).toEqual([])
  })
})

describe('personalBreakEvenPath', () => {
  const makePosition = (
    direction: 'long' | 'short',
    overrides: Partial<PerpPosition> = {}
  ): PerpPosition => ({
    userId: 'u',
    contractId: 'c',
    direction,
    size: 1000,
    costBasis: 100,
    originalCostBasis: 100,
    entryPrice: 50,
    leverage: 10,
    liquidationPrice: direction === 'long' ? 45 : 55,
    openedTime: 0,
    updatedTime: 0,
    ...overrides,
  })

  it('matches applyFunding exactly after one period (paying long)', () => {
    // L > S → longs pay. Walk the position through one real funding event and
    // check its value at the projected break-even price is the original margin.
    const position = makePosition('long')
    const [L, S, k, fMax] = [200, 100, 1, 0.001]
    const f = computeFundingRate(L, S, k, fMax)
    expect(f).toBeGreaterThan(0)

    const path = personalBreakEvenPath(
      position,
      f,
      L,
      S,
      NOW,
      FUNDING_PERIOD_MS,
      1
    )
    expect(path).toHaveLength(2)

    const after = applyFunding(
      { pool: { L, S }, positions: [position] },
      f
    ).positions[0]
    expect(getPositionValue(after, path[1].value)).toBeCloseTo(
      position.originalCostBasis,
      8
    )
    // Paying side's hurdle rises.
    expect(path[1].value).toBeGreaterThan(path[0].value)
  })

  it('matches applyFunding exactly after one period (receiving short)', () => {
    const position = makePosition('short')
    const [L, S, k, fMax] = [200, 100, 1, 0.001]
    const f = computeFundingRate(L, S, k, fMax)

    const path = personalBreakEvenPath(
      position,
      f,
      L,
      S,
      NOW,
      FUNDING_PERIOD_MS,
      1
    )
    expect(path).toHaveLength(2)

    const after = applyFunding(
      { pool: { L, S }, positions: [position] },
      f
    ).positions[0]
    expect(getPositionValue(after, path[1].value)).toBeCloseTo(
      position.originalCostBasis,
      8
    )
    // A receiving short's break-even drifts up — more room above entry.
    expect(path[1].value).toBeGreaterThan(path[0].value)
  })

  it('starts at entry price when no funding has accrued', () => {
    const path = personalBreakEvenPath(
      makePosition('long'),
      0.0005,
      200,
      100,
      NOW,
      FUNDING_PERIOD_MS
    )
    expect(path[0].value).toBeCloseTo(50)
  })

  it('is flat when funding is zero and empty for closed positions', () => {
    const flat = personalBreakEvenPath(
      makePosition('long'),
      0,
      100,
      100,
      NOW,
      FUNDING_PERIOD_MS
    )
    expect(flat[0].value).toBeCloseTo(flat[flat.length - 1].value)
    expect(
      personalBreakEvenPath(
        makePosition('long', { size: 0 }),
        0.001,
        100,
        100,
        NOW,
        FUNDING_PERIOD_MS
      )
    ).toEqual([])
  })
})
