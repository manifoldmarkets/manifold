import { DAY_MS } from '../util/time'
import { mergedEntryPrice } from './amm'
import {
  calculatePerpMetricPeriods,
  PerpMetricPeriodCutoffs,
} from './metric-periods'
import { PerpDirection, PerpEvent, PerpPosition } from './position'

const NOW = 100 * DAY_MS

const periods = (
  dayPrice: number | undefined,
  weekPrice = dayPrice,
  monthPrice = weekPrice
): PerpMetricPeriodCutoffs => ({
  day: { cutoff: NOW - DAY_MS, price: dayPrice },
  week: { cutoff: NOW - 7 * DAY_MS, price: weekPrice },
  month: { cutoff: NOW - 30 * DAY_MS, price: monthPrice },
})

const event = (
  overrides: Partial<PerpEvent> &
    Pick<PerpEvent, 'id' | 'eventType' | 'appliedTime'>
): PerpEvent => ({
  contractId: 'contract',
  userId: 'user',
  ts: overrides.appliedTime,
  oraclePrice: 100,
  sizeDelta: 0,
  costBasisDelta: 0,
  originalCostBasisDelta: 0,
  direction: 'long',
  leverage: 10,
  ...overrides,
})

const position = (overrides: Partial<PerpPosition> = {}): PerpPosition => ({
  userId: 'user',
  contractId: 'contract',
  direction: 'long',
  size: 1000,
  costBasis: 100,
  originalCostBasis: 100,
  entryPrice: 100,
  leverage: 10,
  liquidationPrice: 90,
  openedTime: NOW - 40 * DAY_MS,
  updatedTime: NOW,
  ...overrides,
})

const open = (
  id: number,
  appliedTime: number,
  direction: PerpDirection = 'long',
  size = 1000,
  margin = 100,
  price = 100
) =>
  event({
    id,
    eventType: 'open',
    appliedTime,
    oraclePrice: price,
    direction,
    sizeDelta: size,
    costBasisDelta: margin,
    originalCostBasisDelta: margin,
    data: { entryPrice: price },
  })

describe('calculatePerpMetricPeriods', () => {
  it('marks pre-period exposure at the cutoff oracle price', () => {
    const result = calculatePerpMetricPeriods({
      currentPositions: [position()],
      events: [],
      currentPrice: 110,
      periods: periods(100),
    })

    expect(result?.from.day).toEqual({
      profit: 100,
      profitPercent: 100,
      invested: 100,
      prevValue: 100,
      value: 200,
    })
  })

  it('counts an opening fee paid inside the period as invested cash and loss', () => {
    const result = calculatePerpMetricPeriods({
      currentPositions: [
        position({
          takerFeeCostBasis: 0.5,
          openedTime: NOW - DAY_MS / 2,
        }),
      ],
      events: [
        event({
          id: 1,
          eventType: 'open',
          appliedTime: NOW - DAY_MS / 2,
          sizeDelta: 1_000,
          costBasisDelta: 100,
          originalCostBasisDelta: 100,
          data: { entryPrice: 100, fee: 0.5 },
        }),
      ],
      currentPrice: 100,
      periods: periods(100),
    })

    expect(result?.from.day).toEqual({
      profit: -0.5,
      profitPercent: (-0.5 / 100.5) * 100,
      invested: 100.5,
      prevValue: 0,
      value: 100,
    })
  })

  it('does not charge an opening fee paid before the period again', () => {
    const result = calculatePerpMetricPeriods({
      currentPositions: [position({ takerFeeCostBasis: 0.5 })],
      events: [
        event({
          id: 1,
          eventType: 'open',
          appliedTime: NOW - 2 * DAY_MS,
          sizeDelta: 1_000,
          costBasisDelta: 100,
          originalCostBasisDelta: 100,
          data: { entryPrice: 100, fee: 0.5 },
        }),
      ],
      currentPrice: 100,
      periods: periods(100),
    })

    expect(result?.from.day).toEqual({
      profit: 0,
      profitPercent: 0,
      invested: 100,
      prevValue: 100,
      value: 100,
    })
  })

  it('counts funding and new margin without treating the deposit as profit', () => {
    const result = calculatePerpMetricPeriods({
      currentPositions: [
        position({
          size: 1400,
          costBasis: 140,
          originalCostBasis: 150,
          entryPrice: 100,
          leverage: 10,
        }),
      ],
      events: [
        event({
          id: 2,
          eventType: 'funding',
          appliedTime: NOW - 2 * DAY_MS,
          sizeDelta: -100,
          costBasisDelta: -10,
        }),
        event({
          id: 3,
          eventType: 'add',
          appliedTime: NOW - DAY_MS / 2,
          sizeDelta: 500,
          costBasisDelta: 50,
          originalCostBasisDelta: 50,
          data: { entryPrice: 100 },
        }),
      ],
      currentPrice: 100,
      periods: periods(100),
    })

    expect(result?.from.day.profit).toBeCloseTo(0)
    expect(result?.from.day.invested).toBeCloseTo(140)
    expect(result?.from.week.profit).toBeCloseTo(-10)
    expect(result?.from.week.invested).toBeCloseTo(150)
  })

  it('reconstructs the prior entry price after an add', () => {
    // Derive the merged entry price from the engine's own forward formula
    // rather than hard-coding it, so this test round-trips openPosition's
    // merge instead of pinning whatever number the merge happens to produce.
    // The previous version hard-coded the arithmetic mean and therefore
    // certified a reconstruction that no longer matched the engine.
    const priorSize = 1000
    const priorEntry = 100
    const addedSize = 500
    const addPrice = 120
    const mergedEntry = mergedEntryPrice(
      priorSize,
      priorEntry,
      addedSize,
      addPrice
    )

    const result = calculatePerpMetricPeriods({
      currentPositions: [
        position({
          size: priorSize + addedSize,
          costBasis: 150,
          originalCostBasis: 150,
          entryPrice: mergedEntry,
        }),
      ],
      events: [
        event({
          id: 2,
          eventType: 'add',
          appliedTime: NOW - DAY_MS / 2,
          oraclePrice: addPrice,
          sizeDelta: addedSize,
          costBasisDelta: 50,
          originalCostBasisDelta: 50,
          data: { entryPrice: mergedEntry },
        }),
      ],
      currentPrice: addPrice,
      periods: periods(priorEntry),
    })

    // Recovered prior position: 1000 @ 100, marked at the boundary price of
    // 100, so worth exactly its cost basis.
    expect(result?.from.day.prevValue).toBeCloseTo(100)
    expect(result?.from.day.invested).toBeCloseTo(150)
    // The add carried no P&L of its own, so all profit comes from the prior
    // tranche moving 100 -> 120 on size 1000: (120-100)/100 * 1000 = 200.
    expect(result?.from.day.profit).toBeCloseTo(200)
  })

  it('handles a close-and-flip in canonical id order', () => {
    const result = calculatePerpMetricPeriods({
      currentPositions: [
        position({
          direction: 'short',
          size: 500,
          costBasis: 50,
          originalCostBasis: 50,
          entryPrice: 110,
          leverage: 10,
        }),
      ],
      events: [
        event({
          id: 2,
          eventType: 'close',
          appliedTime: NOW - DAY_MS / 2,
          oraclePrice: 110,
          sizeDelta: -1000,
          costBasisDelta: -100,
          originalCostBasisDelta: -100,
          data: { payout: 200, entryPrice: 100, reason: 'flip' },
        }),
        open(3, NOW - DAY_MS / 2, 'short', 500, 50, 110),
      ],
      currentPrice: 99,
      periods: periods(100),
    })

    expect(result?.from.day.profit).toBeCloseTo(150)
    expect(result?.from.day.invested).toBeCloseTo(150)
    expect(result?.from.day.profitPercent).toBeCloseTo(100)
  })

  it('captures liquidation loss relative to boundary equity', () => {
    const result = calculatePerpMetricPeriods({
      currentPositions: [],
      events: [
        event({
          id: 2,
          eventType: 'liquidation',
          appliedTime: NOW - DAY_MS / 2,
          oraclePrice: 90,
          sizeDelta: -1000,
          costBasisDelta: -100,
          originalCostBasisDelta: -100,
          data: { payout: 0, entryPrice: 100 },
        }),
      ],
      currentPrice: 90,
      periods: periods(95),
    })

    expect(result?.from.day.profit).toBeCloseTo(-50)
    expect(result?.from.day.invested).toBeCloseTo(50)
    expect(result?.from.day.profitPercent).toBeCloseTo(-100)
  })

  it('captures realistic funding and partial ADL state changes', () => {
    const result = calculatePerpMetricPeriods({
      currentPositions: [
        position({
          size: 450,
          costBasis: 90,
          originalCostBasis: 100,
          leverage: 5,
        }),
      ],
      events: [
        event({
          id: 2,
          eventType: 'funding',
          appliedTime: NOW - DAY_MS / 2,
          sizeDelta: -100,
          costBasisDelta: -10,
        }),
        event({
          id: 3,
          eventType: 'adl',
          appliedTime: NOW - DAY_MS / 2,
          sizeDelta: -450,
          costBasisDelta: 0,
        }),
      ],
      currentPrice: 110,
      periods: periods(110),
    })

    expect(result?.from.day.value).toBeCloseTo(135)
    expect(result?.from.day.prevValue).toBeCloseTo(200)
    expect(result?.from.day.profit).toBeCloseTo(-65)
  })

  it('replays a protected-basis settlement as a no-op and a partial close by its fraction', () => {
    // Long opened 40d ago (1000 @ 100 on 100 margin). Yesterday a quarter of
    // it was closed at 110 (payout 0.25 * 200 = 50) and, separately, an
    // opposing realized gain settled 20 of its protected basis — which moves
    // b only. Today the remaining 750 @ 100 on 75 margin is worth 150 at 110.
    const result = calculatePerpMetricPeriods({
      currentPositions: [
        position({
          size: 750,
          costBasis: 75,
          originalCostBasis: 75,
          reserveBasis: 55,
          leverage: 10,
        }),
      ],
      events: [
        event({
          id: 2,
          eventType: 'basis-settlement',
          appliedTime: NOW - DAY_MS / 2,
          sizeDelta: 0,
          costBasisDelta: 0,
          reserveBasisDelta: -20,
          originalCostBasisDelta: 0,
          leverage: null,
          data: { trigger: 'close', reserveBasisAfter: 55 },
        }),
        event({
          id: 3,
          eventType: 'close',
          appliedTime: NOW - DAY_MS / 3,
          oraclePrice: 110,
          sizeDelta: -250,
          costBasisDelta: -25,
          reserveBasisDelta: -25,
          originalCostBasisDelta: -25,
          leverage: 10,
          data: { payout: 50, fraction: 0.25 },
        }),
      ],
      currentPrice: 110,
      periods: periods(100),
    })

    // Boundary value: the full 1000 @ 100 worth 100 at the cutoff price.
    expect(result?.from.day.prevValue).toBeCloseTo(100)
    expect(result?.from.day.value).toBeCloseTo(150)
    // 150 now + 50 realized − 100 boundary − 0 new margin.
    expect(result?.from.day.profit).toBeCloseTo(100)
  })

  it('fails closed on a basis settlement that claims to move size or cost basis', () => {
    const result = calculatePerpMetricPeriods({
      currentPositions: [position()],
      events: [
        event({
          id: 2,
          eventType: 'basis-settlement',
          appliedTime: NOW - DAY_MS / 2,
          sizeDelta: -10,
          costBasisDelta: 0,
          reserveBasisDelta: -20,
        }),
      ],
      currentPrice: 100,
      periods: periods(100),
    })
    expect(result).toBeUndefined()
  })

  it('still fails closed on a partial-looking close without a recorded fraction', () => {
    const result = calculatePerpMetricPeriods({
      currentPositions: [
        position({ size: 750, costBasis: 75, originalCostBasis: 75 }),
      ],
      events: [
        event({
          id: 3,
          eventType: 'close',
          appliedTime: NOW - DAY_MS / 3,
          sizeDelta: -250,
          costBasisDelta: -25,
          originalCostBasisDelta: -25,
          data: { payout: 50 },
        }),
      ],
      currentPrice: 100,
      periods: periods(100),
    })
    expect(result).toBeUndefined()
  })

  it('treats factor-zero ADL payout as realized period profit', () => {
    const result = calculatePerpMetricPeriods({
      currentPositions: [],
      events: [
        event({
          id: 2,
          eventType: 'adl',
          appliedTime: NOW - DAY_MS / 2,
          sizeDelta: -1000,
          costBasisDelta: -100,
          originalCostBasisDelta: -100,
          data: { payout: 25, entryPrice: 100, adlFactor: 0 },
        }),
      ],
      currentPrice: 90,
      periods: periods(100),
    })

    expect(result?.from.day.profit).toBeCloseTo(-75)
    expect(result?.from.day.prevValue).toBeCloseTo(100)
  })

  it('treats settlement payout as realized period profit', () => {
    const result = calculatePerpMetricPeriods({
      currentPositions: [],
      events: [
        event({
          id: 2,
          eventType: 'close',
          appliedTime: NOW - DAY_MS / 2,
          oraclePrice: 120,
          sizeDelta: -1000,
          costBasisDelta: -100,
          originalCostBasisDelta: -100,
          data: {
            payout: 300,
            entryPrice: 100,
            reason: 'resolve-market',
          },
        }),
      ],
      currentPrice: 120,
      periods: periods(100),
    })

    expect(result?.from.day.profit).toBeCloseTo(200)
    expect(result?.from.day.invested).toBeCloseTo(100)
  })

  it('supports a short position and funding receipt', () => {
    const result = calculatePerpMetricPeriods({
      currentPositions: [
        position({
          direction: 'short',
          size: 1100,
          costBasis: 110,
          originalCostBasis: 100,
          leverage: 10,
        }),
      ],
      events: [
        event({
          id: 2,
          eventType: 'funding',
          appliedTime: NOW - DAY_MS / 2,
          direction: 'short',
          sizeDelta: 100,
          costBasisDelta: 10,
        }),
      ],
      currentPrice: 90,
      periods: periods(100),
    })

    expect(result?.from.day.prevValue).toBeCloseTo(100)
    expect(result?.from.day.value).toBeCloseTo(220)
    expect(result?.from.day.profit).toBeCloseTo(120)
  })

  it('uses application time for periods and id for transition order', () => {
    const delayedLiquidation = event({
      id: 3,
      eventType: 'liquidation',
      appliedTime: NOW - DAY_MS / 2,
      ts: NOW - 2 * DAY_MS,
      oraclePrice: 90,
      sizeDelta: -1000,
      costBasisDelta: -100,
      originalCostBasisDelta: -100,
      data: { payout: 0, entryPrice: 100 },
    })
    const result = calculatePerpMetricPeriods({
      currentPositions: [],
      events: [delayedLiquidation],
      currentPrice: 90,
      periods: periods(100),
    })

    expect(result?.from.day.profit).toBeCloseTo(-100)
  })

  it('includes an event exactly at the cutoff', () => {
    const result = calculatePerpMetricPeriods({
      currentPositions: [position()],
      events: [open(1, NOW - DAY_MS)],
      currentPrice: 100,
      periods: periods(undefined),
    })

    expect(result?.from.day).toEqual({
      profit: 0,
      profitPercent: 0,
      invested: 100,
      prevValue: 0,
      value: 100,
    })
  })

  it('does not require a cutoff price when the boundary account was empty', () => {
    const result = calculatePerpMetricPeriods({
      currentPositions: [position()],
      events: [open(1, NOW - DAY_MS / 2)],
      currentPrice: 100,
      periods: periods(undefined),
    })

    expect(result?.from.day.prevValue).toBe(0)
  })

  it('fails closed on a missing boundary price or malformed exit payout', () => {
    expect(
      calculatePerpMetricPeriods({
        currentPositions: [position()],
        events: [],
        currentPrice: 110,
        periods: periods(undefined),
      })
    ).toBeUndefined()

    expect(
      calculatePerpMetricPeriods({
        currentPositions: [],
        events: [
          event({
            id: 2,
            eventType: 'close',
            appliedTime: NOW - DAY_MS / 2,
            sizeDelta: -1000,
            costBasisDelta: -100,
            originalCostBasisDelta: -100,
            data: { entryPrice: 100 },
          }),
        ],
        currentPrice: 100,
        periods: periods(100),
      })
    ).toBeUndefined()
  })

  it('fails closed on residual basis, invalid transitions, or hedge state', () => {
    const residualBasis = event({
      id: 1,
      eventType: 'open',
      appliedTime: NOW - DAY_MS / 2,
      sizeDelta: 1000,
      costBasisDelta: 90,
      originalCostBasisDelta: 100,
      data: { entryPrice: 100 },
    })
    expect(
      calculatePerpMetricPeriods({
        currentPositions: [position()],
        events: [residualBasis],
        currentPrice: 100,
        periods: periods(100),
      })
    ).toBeUndefined()

    expect(
      calculatePerpMetricPeriods({
        currentPositions: [position()],
        events: [
          event({
            id: 1,
            eventType: 'add',
            appliedTime: NOW - DAY_MS / 2,
            sizeDelta: -1,
          }),
        ],
        currentPrice: 100,
        periods: periods(100),
      })
    ).toBeUndefined()

    expect(
      calculatePerpMetricPeriods({
        currentPositions: [
          position(),
          position({ direction: 'short', liquidationPrice: 110 }),
        ],
        events: [],
        currentPrice: 100,
        periods: periods(100),
      })
    ).toBeUndefined()

    expect(
      calculatePerpMetricPeriods({
        currentPositions: [position({ size: Number.NaN })],
        events: [],
        currentPrice: 100,
        periods: periods(100),
      })
    ).toBeUndefined()
  })
})
