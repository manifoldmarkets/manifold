import {
  assertPerpTakerFeeConfig,
  accruePerpPositionTakerFee,
  calcPerpSizeFee,
  calcPerpTakerFee,
  creditPerpPoolFee,
  getPerpTakerFeeImpact,
  getPerpTakerFeeBps,
  perpOpenFeeQuote,
  perpSizeFeeDetails,
  PERP_TAKER_FEE_IMPACT_DEFAULT,
  PERP_TAKER_FEE_IMPACT_MAX,
  PERP_TAKER_FEE_BPS_DEFAULT,
  PERP_TAKER_FEE_BPS_MAX,
} from './fees'
import { openPosition, PerpState } from './amm'
import { isPerpEscrowBalanced } from './escrow'
import { PerpPosition } from './position'

describe('getPerpTakerFeeBps', () => {
  it('defaults when the field is missing (pre-fee contracts)', () => {
    expect(getPerpTakerFeeBps({})).toBe(PERP_TAKER_FEE_BPS_DEFAULT)
  })

  it('returns a valid configured value, including an explicit 0', () => {
    expect(getPerpTakerFeeBps({ takerFeeBps: 0 })).toBe(0)
    expect(getPerpTakerFeeBps({ takerFeeBps: 2 })).toBe(2)
    expect(getPerpTakerFeeBps({ takerFeeBps: PERP_TAKER_FEE_BPS_MAX })).toBe(
      PERP_TAKER_FEE_BPS_MAX
    )
  })

  it('falls back to the default on corrupt values (display path is total)', () => {
    for (const bad of [
      NaN,
      Infinity,
      -Infinity,
      -1,
      PERP_TAKER_FEE_BPS_MAX + 1,
    ])
      expect(getPerpTakerFeeBps({ takerFeeBps: bad })).toBe(
        PERP_TAKER_FEE_BPS_DEFAULT
      )
  })
})

describe('assertPerpTakerFeeConfig', () => {
  it('accepts undefined and the full valid range', () => {
    expect(() => assertPerpTakerFeeConfig({})).not.toThrow()
    expect(() => assertPerpTakerFeeConfig({ takerFeeBps: 0 })).not.toThrow()
    expect(() =>
      assertPerpTakerFeeConfig({ takerFeeBps: PERP_TAKER_FEE_BPS_MAX })
    ).not.toThrow()
    expect(() => assertPerpTakerFeeConfig({ takerFeeImpact: 0 })).not.toThrow()
    expect(() => assertPerpTakerFeeConfig({ takerFeeImpact: 90 })).not.toThrow()
    expect(() =>
      assertPerpTakerFeeConfig({ takerFeeImpact: PERP_TAKER_FEE_IMPACT_MAX })
    ).not.toThrow()
    expect(() =>
      assertPerpTakerFeeConfig({ takerFeeBps: 10, takerFeeImpact: 90 })
    ).not.toThrow()
  })

  it('fails closed on corrupt persisted values', () => {
    for (const bad of [NaN, Infinity, -1, PERP_TAKER_FEE_BPS_MAX + 0.001])
      expect(() => assertPerpTakerFeeConfig({ takerFeeBps: bad })).toThrow()
    for (const bad of [NaN, Infinity, -1, PERP_TAKER_FEE_IMPACT_MAX + 0.001])
      expect(() => assertPerpTakerFeeConfig({ takerFeeImpact: bad })).toThrow()
    // A corrupt takerFeeImpact blocks trading even when the base is fine.
    expect(() =>
      assertPerpTakerFeeConfig({ takerFeeBps: 10, takerFeeImpact: NaN })
    ).toThrow()
  })
})

describe('getPerpTakerFeeImpact', () => {
  it('defaults when the field is missing (pre-impact contracts)', () => {
    expect(getPerpTakerFeeImpact({})).toBe(PERP_TAKER_FEE_IMPACT_DEFAULT)
  })

  it('returns a valid configured value, including an explicit 0', () => {
    expect(getPerpTakerFeeImpact({ takerFeeImpact: 0 })).toBe(0)
    expect(getPerpTakerFeeImpact({ takerFeeImpact: 90 })).toBe(90)
    expect(
      getPerpTakerFeeImpact({ takerFeeImpact: PERP_TAKER_FEE_IMPACT_MAX })
    ).toBe(PERP_TAKER_FEE_IMPACT_MAX)
  })

  it('falls back to the default on corrupt values (display path is total)', () => {
    for (const bad of [
      NaN,
      Infinity,
      -Infinity,
      -1,
      PERP_TAKER_FEE_IMPACT_MAX + 1,
    ])
      expect(getPerpTakerFeeImpact({ takerFeeImpact: bad })).toBe(
        PERP_TAKER_FEE_IMPACT_DEFAULT
      )
  })

  it('ships with the size term OFF, so deploying is a behavior no-op', () => {
    // The rollout contract: nothing changes on deploy; takerFeeImpact is
    // enabled per-contract via update-perp-config afterwards.
    expect(PERP_TAKER_FEE_IMPACT_DEFAULT).toBe(0)
    expect(
      calcPerpSizeFee({
        notionalBefore: 0,
        notionalAfter: 662_000,
        poolDepth: 466_000,
        baseBps: 10,
        impact: PERP_TAKER_FEE_IMPACT_DEFAULT,
      })
    ).toBeCloseTo(calcPerpTakerFee(662_000, 10), 10)
  })
})

describe('calcPerpTakerFee', () => {
  it('charges bps of notional', () => {
    // 5 bps on M$200,000 notional = M$100.
    expect(calcPerpTakerFee(200_000, 5)).toBeCloseTo(100, 10)
    expect(calcPerpTakerFee(10 * 2, 5)).toBeCloseTo(0.01, 12)
  })

  it('scales with notional, so the fee cannot be outgrown by sizing up', () => {
    const fee = calcPerpTakerFee(1_000, 5)
    expect(calcPerpTakerFee(10_000, 5)).toBeCloseTo(10 * fee, 10)
  })

  it('returns 0 for degenerate inputs', () => {
    for (const notional of [0, -1, NaN, Infinity])
      expect(calcPerpTakerFee(notional, 5)).toBe(0)
    for (const bps of [0, -5, NaN, Infinity])
      expect(calcPerpTakerFee(1_000, bps)).toBe(0)
  })

  it('exceeds the measured tick-sniping edge at the default rate', () => {
    // The BTC bots' realized edge was ~1.5 bps of notional per round trip.
    // Closing is free, so the open-side default IS the round-trip cost and
    // must price that out with margin to spare.
    expect(PERP_TAKER_FEE_BPS_DEFAULT).toBeGreaterThan(0.73 * 2)
  })
})

describe('calcPerpSizeFee', () => {
  // Calibration constants from the 2026-08-19 measurement: honest median
  // trade is 1.1% of pool, whale median 142%, on a ~M$466k BTC pool.
  const P = 466_000
  const base = 10
  const impact = 90
  const feeFor = (notional: number) =>
    calcPerpSizeFee({
      notionalBefore: 0,
      notionalAfter: notional,
      poolDepth: P,
      baseBps: base,
      impact,
    })
  const effectiveBpsFor = (notional: number) =>
    (feeFor(notional) / notional) * 10_000

  it('charges an honest-sized trade within 0.1 bps of the base', () => {
    // share 1.1% → 10 + 30·0.011² = 10.004 bps
    expect(effectiveBpsFor(0.011 * P)).toBeCloseTo(base, 1)
    expect(Math.abs(effectiveBpsFor(0.011 * P) - base)).toBeLessThan(0.1)
  })

  it('charges base + impact/3 bps on an exactly pool-sized position', () => {
    expect(effectiveBpsFor(P)).toBeCloseTo(base + impact / 3, 10)
  })

  it('charges the whale median (142% of pool) ~70 bps — above their ~37 bps gross edge', () => {
    expect(effectiveBpsFor(1.42 * P)).toBeCloseTo(
      base + (impact / 3) * 1.42 ** 2,
      8
    )
    expect(effectiveBpsFor(1.42 * P)).toBeCloseTo(70.49, 1)
  })

  it('is monotonically increasing in size, in both mana and rate', () => {
    const sizes = [1_000, 5_126, 47_000, 233_000, 466_000, 662_000, 1_600_000]
    for (let i = 1; i < sizes.length; i++) {
      expect(feeFor(sizes[i])).toBeGreaterThan(feeFor(sizes[i - 1]))
      expect(effectiveBpsFor(sizes[i])).toBeGreaterThan(
        effectiveBpsFor(sizes[i - 1])
      )
    }
  })

  it('leaves the TOTAL uncapped while the base config stays capped at 100 bps', () => {
    // The whale max entry (343% of pool) pays ~363 bps — far past the base
    // cap, by design. Only the configured base is bounded.
    expect(effectiveBpsFor(3.43 * P)).toBeCloseTo(362.95, 1)
    expect(() => assertPerpTakerFeeConfig({ takerFeeBps: 101 })).toThrow()
    expect(() =>
      assertPerpTakerFeeConfig({ takerFeeBps: 100, takerFeeImpact: 90 })
    ).not.toThrow()
  })

  it('is splitting-proof: one open costs the sum of sequential adds partitioning it', () => {
    const whole = 662_000
    const parts = [1, 50_000, 12_345.5, 199_653.5, 400_000]
    expect(parts.reduce((a, b) => a + b, 0)).toBe(whole) // partition is honest

    const oneShot = feeFor(whole)
    let notionalBefore = 0
    let summed = 0
    for (const part of parts) {
      summed += calcPerpSizeFee({
        notionalBefore,
        notionalAfter: notionalBefore + part,
        poolDepth: P,
        baseBps: base,
        impact,
      })
      notionalBefore += part
    }
    expect(summed).toBeCloseTo(oneShot, 6)
  })

  it('prices an add at the CUMULATIVE share, not as a fresh position', () => {
    // The marginal rate rises with the standing position, so the same added
    // notional costs more on top of an existing stake than standalone.
    const addOnTop = calcPerpSizeFee({
      notionalBefore: 400_000,
      notionalAfter: 500_000,
      poolDepth: P,
      baseBps: base,
      impact,
    })
    const fresh = feeFor(100_000)
    expect(addOnTop).toBeGreaterThan(fresh)
  })

  it('reduces to the flat base fee when the impact is 0', () => {
    for (const notional of [20, 5_126, 662_000])
      expect(
        calcPerpSizeFee({
          notionalBefore: 0,
          notionalAfter: notional,
          poolDepth: P,
          baseBps: base,
          impact: 0,
        })
      ).toBeCloseTo(calcPerpTakerFee(notional, base), 10)
  })

  it('falls back to the base alone when the pool depth is degenerate', () => {
    for (const badPool of [0, -1, NaN, Infinity])
      expect(
        calcPerpSizeFee({
          notionalBefore: 0,
          notionalAfter: 10_000,
          poolDepth: badPool,
          baseBps: base,
          impact,
        })
      ).toBeCloseTo(calcPerpTakerFee(10_000, base), 10)
  })

  it('returns 0 when nothing is added or a notional is degenerate', () => {
    const ok = {
      notionalBefore: 0,
      notionalAfter: 10_000,
      poolDepth: P,
      baseBps: base,
      impact,
    }
    expect(calcPerpSizeFee({ ...ok, notionalAfter: 0 })).toBe(0)
    expect(
      calcPerpSizeFee({ ...ok, notionalBefore: 500, notionalAfter: 500 })
    ).toBe(0)
    expect(
      calcPerpSizeFee({ ...ok, notionalBefore: 600, notionalAfter: 500 })
    ).toBe(0)
    for (const bad of [-1, NaN, Infinity])
      expect(calcPerpSizeFee({ ...ok, notionalBefore: bad })).toBe(0)
    for (const bad of [NaN, Infinity, -Infinity])
      expect(calcPerpSizeFee({ ...ok, notionalAfter: bad })).toBe(0)
  })

  it('treats a degenerate base or impact as 0 rather than poisoning the fee', () => {
    const ok = {
      notionalBefore: 0,
      notionalAfter: 466_000,
      poolDepth: P,
      impact,
    }
    // No base: pure impact term, (impact/3)·1² = 30 bps on a pool-sized entry.
    for (const badBase of [0, -5, NaN, Infinity])
      expect(
        (calcPerpSizeFee({ ...ok, baseBps: badBase }) / 466_000) * 10_000
      ).toBeCloseTo(impact / 3, 8)
    // No impact: flat base.
    for (const badImpact of [-5, NaN, Infinity])
      expect(
        calcPerpSizeFee({ ...ok, baseBps: base, impact: badImpact })
      ).toBeCloseTo(calcPerpTakerFee(466_000, base), 10)
    // Both degenerate: free, never negative or NaN.
    expect(calcPerpSizeFee({ ...ok, baseBps: 0, impact: 0 })).toBe(0)
  })
})

describe('perpSizeFeeDetails', () => {
  const P = 466_000
  const args = {
    notionalBefore: 0,
    notionalAfter: 1.42 * P,
    poolDepth: P,
    baseBps: 10,
    impact: 90,
  }

  it('decomposes the effective rate into base + size and reports the pool share', () => {
    const d = perpSizeFeeDetails(args)
    expect(d.fee).toBeCloseTo(calcPerpSizeFee(args), 12)
    expect(d.effectiveBps).toBeCloseTo((d.fee / args.notionalAfter) * 10_000, 8)
    expect(args.baseBps + d.sizeBps).toBeCloseTo(d.effectiveBps, 8)
    expect(d.sizeBps).toBeCloseTo(30 * 1.42 ** 2, 6)
    expect(d.poolShareAfter).toBeCloseTo(1.42, 10)
  })

  it('reads as just the base for small trades', () => {
    const d = perpSizeFeeDetails({ ...args, notionalAfter: 0.011 * P })
    expect(d.effectiveBps).toBeCloseTo(10, 1)
    expect(d.sizeBps).toBeLessThan(0.01)
  })

  it('zeroes the rate when nothing is added but still reports the standing share', () => {
    const d = perpSizeFeeDetails({
      ...args,
      notionalBefore: 662_000,
      notionalAfter: 662_000,
    })
    expect(d.fee).toBe(0)
    expect(d.effectiveBps).toBe(0)
    expect(d.sizeBps).toBe(0)
    expect(d.poolShareAfter).toBeCloseTo(662_000 / P, 10)
  })

  it('reports effective = base with no share when the pool is degenerate', () => {
    const d = perpSizeFeeDetails({ ...args, poolDepth: 0 })
    expect(d.effectiveBps).toBeCloseTo(10, 10)
    expect(d.sizeBps).toBeCloseTo(0, 10)
    expect(d.poolShareAfter).toBe(0)
  })
})

describe('open path with the size fee (engine composition)', () => {
  // Mirrors executePerpTrade's open sequence exactly: price the fee on the
  // PRE-trade pool, openPosition, accruePerpPositionTakerFee, then
  // creditPerpPoolFee — and checks the same escrow identity the engine
  // asserts (ledger = poolLong + poolShort) after a pool-scale entry.
  const state: PerpState = { pool: { L: 250_000, S: 216_000 }, positions: [] }
  const price = 100
  const mana = 662_000
  const leverage = 1

  const runOpenPath = () => {
    const details = perpOpenFeeQuote({
      grossPoolDepth: state.pool.L + state.pool.S,
      existingSize: 0,
      existingCostBasis: 0,
      existingTakerFeeCostBasis: 0,
      addedNotional: mana * leverage,
      baseBps: 10,
      impact: 90,
    })
    const openRes = openPosition(
      state,
      'user-1',
      'contract-1',
      'long',
      mana,
      leverage,
      price,
      undefined,
      1_700_000_000_000
    )
    const accrued = accruePerpPositionTakerFee(
      openRes.state,
      openRes.position,
      details.fee
    )
    const credited = creditPerpPoolFee(accrued.state, 'long', details.fee)
    return { details, accrued, credited }
  }

  it('keeps the escrow identity: everything debited from the user is in the pools', () => {
    const { details, credited } = runOpenPath()
    // The user was debited margin + fee into contract escrow.
    const ledgerBalance = state.pool.L + state.pool.S + mana + details.fee
    expect(
      isPerpEscrowBalanced({
        ledgerBalance,
        poolLong: credited.pool.L,
        poolShort: credited.pool.S,
      })
    ).toBe(true)
  })

  it("credits the fee to the trader's side pool only", () => {
    const { details, credited } = runOpenPath()
    expect(details.fee).toBeGreaterThan(0)
    expect(credited.pool.L).toBeCloseTo(state.pool.L + mana + details.fee, 6)
    expect(credited.pool.S).toBe(state.pool.S)
  })

  it('raises takerFeeCostBasis by exactly the fee', () => {
    const { details, accrued } = runOpenPath()
    expect(accrued.position.takerFeeCostBasis).toBeCloseTo(details.fee, 8)
  })

  it('charges the pool-scale entry the whale rate, not the base', () => {
    const { details } = runOpenPath()
    // share = 662k / 466k ≈ 1.42 → ~70 bps effective.
    expect(details.effectiveBps).toBeGreaterThan(70)
    expect(details.effectiveBps).toBeLessThan(71)
  })
})

describe('perpOpenFeeQuote (net-of-own-contribution depth)', () => {
  const base = 10
  const impact = 90
  const initialPool: PerpState = {
    pool: { L: 250_000, S: 216_000 },
    positions: [],
  }
  const price = 100

  const oneShotQuote = (notional: number) =>
    perpOpenFeeQuote({
      grossPoolDepth: initialPool.pool.L + initialPool.pool.S,
      existingSize: 0,
      existingCostBasis: 0,
      existingTakerFeeCostBasis: 0,
      addedNotional: notional,
      baseBps: base,
      impact,
    })

  it('matches the plain quote for a fresh trader (calibration unchanged)', () => {
    const q = oneShotQuote(662_000)
    const d = perpSizeFeeDetails({
      notionalBefore: 0,
      notionalAfter: 662_000,
      poolDepth: 466_000,
      baseBps: base,
      impact,
    })
    expect(q.fee).toBeCloseTo(d.fee, 10)
    expect(q.effectiveBps).toBeCloseTo(d.effectiveBps, 10)
  })

  it('is splitting-proof THROUGH the engine: chunked adds whose margin+fee deepen the pool cost the one-shot fee', () => {
    // This is the leak netting-out exists to close: openPosition banks each
    // add's margin (and creditPerpPoolFee its fee) into the trader's side
    // pool, so pricing against the gross pool let sequential adds ride a
    // depth the trader deepened themselves (~75% off at 1× continuous).
    // With the depth net of the trader's own contribution, the chunks must
    // telescope to exactly the one-shot integral. Leverage 1× is the
    // worst case (margin = notional deepens the pool fastest).
    const whole = 662_000
    const leverage = 1
    const chunks = [1, 50_000, 12_345.5, 199_653.5, 400_000]
    expect(chunks.reduce((a, b) => a + b, 0)).toBe(whole)

    let state = initialPool
    let position: PerpPosition | undefined
    let totalFee = 0
    for (const chunkNotional of chunks) {
      const chunkMana = chunkNotional / leverage
      const details = perpOpenFeeQuote({
        grossPoolDepth: state.pool.L + state.pool.S,
        existingSize: position?.size ?? 0,
        existingCostBasis: position?.costBasis ?? 0,
        existingTakerFeeCostBasis: position?.takerFeeCostBasis ?? 0,
        addedNotional: chunkNotional,
        baseBps: base,
        impact,
      })
      // Apply the chunk exactly as the engine does, so the NEXT chunk sees
      // the genuinely deepened pool.
      const openRes = openPosition(
        state,
        'user-1',
        'contract-1',
        'long',
        chunkMana,
        leverage,
        price,
        position,
        1_700_000_000_000
      )
      const accrued = accruePerpPositionTakerFee(
        openRes.state,
        openRes.position,
        details.fee
      )
      state = creditPerpPoolFee(accrued.state, 'long', details.fee)
      position = accrued.position
      totalFee += details.fee
    }
    expect(totalFee).toBeCloseTo(oneShotQuote(whole).fee, 6)
  })

  it('prices a repeat entry after a full close like a fresh one (no residual discount)', () => {
    // Closing returns the margin (payout leaves the pool) and deletes the
    // row, so a re-open prices against the post-close pool with zero own
    // contribution — cycling cannot manufacture a discount.
    const q = oneShotQuote(662_000)
    expect(q.poolShareAfter).toBeCloseTo(662_000 / 466_000, 10)
  })

  it('escalates, never cheapens, as the trader dominates the pool', () => {
    // A standing position's margin is subtracted from the depth, so the SAME
    // added notional costs more for a trader who already dominates the pool
    // than for a fresh one.
    const fresh = oneShotQuote(100_000)
    const dominating = perpOpenFeeQuote({
      grossPoolDepth: 466_000 + 300_000, // pool banked their 300k margin (1×)
      existingSize: 300_000,
      existingCostBasis: 300_000,
      existingTakerFeeCostBasis: 0,
      addedNotional: 100_000,
      baseBps: base,
      impact,
    })
    expect(dominating.fee).toBeGreaterThan(fresh.fee)
  })

  it('flags exhausted depth so chargers fail closed instead of pricing base-only', () => {
    // Own contribution ≥ a VALID gross pool: reachable when a side pool is
    // drained below its holders' aggregate cost basis while the opposing
    // pool still gives the OI cap headroom. The returned fee is base-only
    // (underpriced!), so the flag is what makes the engine reject rather
    // than hand the market's largest holder the cheapest rate.
    const q = perpOpenFeeQuote({
      grossPoolDepth: 10_000,
      existingSize: 50_000,
      existingCostBasis: 50_000,
      existingTakerFeeCostBasis: 0,
      addedNotional: 20_000,
      baseBps: base,
      impact,
    })
    expect(q.effectiveBps).toBeCloseTo(base, 10)
    expect(q.depthExhausted).toBe(true)
    // No flag when the size fee is off, when nothing is added, or for a
    // healthy fresh trader.
    expect(oneShotQuote(662_000).depthExhausted).toBe(false)
    expect(
      perpOpenFeeQuote({
        grossPoolDepth: 10_000,
        existingSize: 50_000,
        existingCostBasis: 50_000,
        existingTakerFeeCostBasis: 0,
        addedNotional: 20_000,
        baseBps: base,
        impact: 0,
      }).depthExhausted
    ).toBe(false)
    expect(
      perpOpenFeeQuote({
        grossPoolDepth: 10_000,
        existingSize: 50_000,
        existingCostBasis: 50_000,
        existingTakerFeeCostBasis: 0,
        addedNotional: 0,
        baseBps: base,
        impact,
      }).depthExhausted
    ).toBe(false)
  })

  it('treats corrupt pools and corrupt own-contribution fields as 0 (display path is total)', () => {
    for (const badPool of [NaN, Infinity, -1]) {
      const q = perpOpenFeeQuote({
        grossPoolDepth: badPool,
        existingSize: 0,
        existingCostBasis: 0,
        existingTakerFeeCostBasis: 0,
        addedNotional: 10_000,
        baseBps: base,
        impact,
      })
      expect(q.fee).toBeCloseTo(calcPerpTakerFee(10_000, base), 10)
      // A corrupt gross is NOT "exhausted" — the engine's escrow assert owns
      // pool sanity; the flag is reserved for a valid pool the trader fills.
      expect(q.depthExhausted).toBe(false)
    }
    // Corrupt existing fields normalize to 0 here; the ENGINE separately
    // fail-closes on a corrupt row before pricing (see openOrAddPosition).
    const q = perpOpenFeeQuote({
      grossPoolDepth: 466_000,
      existingSize: NaN,
      existingCostBasis: NaN,
      existingTakerFeeCostBasis: Infinity,
      addedNotional: 10_000,
      baseBps: base,
      impact,
    })
    expect(q.fee).toBeCloseTo(oneShotQuote(10_000).fee, 10)
  })
})

describe('creditPerpPoolFee', () => {
  const state: PerpState = { pool: { L: 100, S: 50 }, positions: [] }

  it('credits the given side only', () => {
    expect(creditPerpPoolFee(state, 'long', 5).pool).toEqual({ L: 105, S: 50 })
    expect(creditPerpPoolFee(state, 'short', 5).pool).toEqual({ L: 100, S: 55 })
  })

  it('conserves total pool + fee', () => {
    const next = creditPerpPoolFee(state, 'short', 2.5)
    expect(next.pool.L + next.pool.S).toBeCloseTo(
      state.pool.L + state.pool.S + 2.5,
      12
    )
  })

  it('is identity for zero or degenerate fees', () => {
    for (const fee of [0, -1, NaN, Infinity])
      expect(creditPerpPoolFee(state, 'long', fee)).toBe(state)
  })

  it('does not mutate the input state', () => {
    creditPerpPoolFee(state, 'long', 5)
    expect(state.pool).toEqual({ L: 100, S: 50 })
  })
})

describe('accruePerpPositionTakerFee', () => {
  const position: PerpPosition = {
    userId: 'u1',
    contractId: 'c1',
    direction: 'long',
    size: 1_000,
    costBasis: 100,
    originalCostBasis: 100,
    takerFeeCostBasis: 0.5,
    entryPrice: 100,
    leverage: 10,
    liquidationPrice: 90,
    openedTime: 1,
    updatedTime: 1,
  }
  const other = { ...position, userId: 'u2' }
  const state: PerpState = {
    pool: { L: 100, S: 50 },
    positions: [position, other],
  }

  it('tracks cumulative fees without changing margin or other positions', () => {
    const next = accruePerpPositionTakerFee(state, position, 0.25)
    expect(next.position).toEqual({ ...position, takerFeeCostBasis: 0.75 })
    expect(next.state.positions).toEqual([next.position, other])
    expect(next.position.costBasis).toBe(position.costBasis)
    expect(next.position.originalCostBasis).toBe(position.originalCostBasis)
    expect(state.positions[0]).toBe(position)
  })

  it('is an identity for zero or invalid new fees', () => {
    for (const fee of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const next = accruePerpPositionTakerFee(state, position, fee)
      expect(next).toEqual({ state, position })
    }
  })

  it('fails closed on corrupt stored fee basis', () => {
    expect(() =>
      accruePerpPositionTakerFee(
        state,
        { ...position, takerFeeCostBasis: Number.NaN },
        1
      )
    ).toThrow()
  })
})
