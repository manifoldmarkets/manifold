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

  it('replays a partial close against the row it left open', () => {
    // Held 1000 notional on M$100 of margin at Pe = 100. Half a day in,
    // closed 40% at 110 for a payout of 0.4 x (100 + 100) = M$80, leaving
    // 600 notional on M$60 at the SAME entry price.
    const result = calculatePerpMetricPeriods({
      currentPositions: [
        position({ size: 600, costBasis: 60, originalCostBasis: 60 }),
      ],
      events: [
        event({
          id: 2,
          eventType: 'close',
          appliedTime: NOW - DAY_MS / 2,
          oraclePrice: 110,
          sizeDelta: -400,
          costBasisDelta: -40,
          originalCostBasisDelta: -40,
          // The survivor's leverage, not 0 — a partial close does not flatten.
          leverage: 10,
          data: {
            payout: 80,
            entryPrice: 100,
            fraction: 0.4,
            remainingSize: 600,
          },
        }),
      ],
      currentPrice: 110,
      periods: periods(100),
    })

    // Boundary: the WHOLE position at the cutoff price, worth its margin.
    // End: M$80 realized plus 600 notional now worth M$120.
    expect(result?.from.day.invested).toBeCloseTo(100)
    expect(result?.from.day.profit).toBeCloseTo(100)
    expect(result?.from.day.profitPercent).toBeCloseTo(100)
  })

  it('refuses a liquidation that left the position open', () => {
    // Partial closes relaxed the full-exit rule for closes only: liquidation
    // forfeits the whole position, so a row surviving one is malformed.
    expect(
      calculatePerpMetricPeriods({
        currentPositions: [
          position({ size: 600, costBasis: 60, originalCostBasis: 60 }),
        ],
        events: [
          event({
            id: 2,
            eventType: 'liquidation',
            appliedTime: NOW - DAY_MS / 2,
            oraclePrice: 90,
            sizeDelta: -400,
            costBasisDelta: -40,
            originalCostBasisDelta: -40,
            data: { payout: 0, entryPrice: 100 },
          }),
        ],
        currentPrice: 90,
        periods: periods(95),
      })
    ).toBeUndefined()
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
