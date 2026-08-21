import {
  assertPerpTakerFeeConfig,
  accruePerpPositionTakerFee,
  calcPerpSizeFee,
  calcPerpTakerFee,
  creditPerpPoolFee,
  getPerpEffectiveTakerFeeBps,
  getPerpTakerFeeImpact,
  getPerpTakerFeeBps,
  perpMaxFeeFor,
  perpOpenFeeQuote,
  perpOwnContributionInputs,
  perpSizeFeeDetails,
  PERP_FEE_SLIPPAGE_BPS,
  PERP_MAX_FEE_SHARE_OF_MARGIN,
  PERP_TAKER_FEE_API_BPS_MAX,
  PERP_TAKER_FEE_IMPACT_DEFAULT,
  PERP_TAKER_FEE_IMPACT_MAX,
  PERP_TAKER_FEE_BPS_DEFAULT,
  PERP_TAKER_FEE_BPS_MAX,
} from './fees'
import {
  assertPerpPositionNumbers,
  closePosition,
  getPerpBackingPool,
  getPositionValue,
  openPosition,
  PerpState,
} from './amm'
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

describe('getPerpEffectiveTakerFeeBps', () => {
  it('web trades always pay the base, ignoring any API rate', () => {
    expect(getPerpEffectiveTakerFeeBps({ takerFeeBps: 10 }, false)).toBe(10)
    expect(
      getPerpEffectiveTakerFeeBps(
        { takerFeeBps: 10, takerFeeApiBps: 200 },
        false
      )
    ).toBe(10)
  })

  it('API trades pay the API rate when it is set and higher', () => {
    expect(
      getPerpEffectiveTakerFeeBps({ takerFeeBps: 10, takerFeeApiBps: 40 }, true)
    ).toBe(40)
    expect(
      getPerpEffectiveTakerFeeBps(
        { takerFeeBps: 10, takerFeeApiBps: PERP_TAKER_FEE_API_BPS_MAX },
        true
      )
    ).toBe(PERP_TAKER_FEE_API_BPS_MAX)
  })

  it('an API rate below the base can never discount API flow', () => {
    expect(
      getPerpEffectiveTakerFeeBps({ takerFeeBps: 50, takerFeeApiBps: 5 }, true)
    ).toBe(50)
    expect(
      getPerpEffectiveTakerFeeBps({ takerFeeBps: 50, takerFeeApiBps: 0 }, true)
    ).toBe(50)
  })

  it('missing or corrupt API rate reads as "no separate rate" (display path is total)', () => {
    expect(getPerpEffectiveTakerFeeBps({ takerFeeBps: 10 }, true)).toBe(10)
    for (const bad of [NaN, Infinity, -1, PERP_TAKER_FEE_API_BPS_MAX + 1])
      expect(
        getPerpEffectiveTakerFeeBps(
          { takerFeeBps: 10, takerFeeApiBps: bad },
          true
        )
      ).toBe(10)
  })

  it('defaults the base for pre-fee contracts on both channels', () => {
    expect(getPerpEffectiveTakerFeeBps({}, false)).toBe(
      PERP_TAKER_FEE_BPS_DEFAULT
    )
    expect(getPerpEffectiveTakerFeeBps({ takerFeeApiBps: 40 }, true)).toBe(40)
    // Pin the DEFAULT as the API branch's floor too. Without these two, an
    // implementation that read takerFeeBps raw on the API branch (0 when
    // absent) would charge legacy contracts 0 bps and let an API rate below
    // the default win — the exact inversion this function exists to prevent
    // — while every other assertion here stayed green.
    expect(getPerpEffectiveTakerFeeBps({}, true)).toBe(
      PERP_TAKER_FEE_BPS_DEFAULT
    )
    expect(getPerpEffectiveTakerFeeBps({ takerFeeApiBps: 5 }, true)).toBe(
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
    expect(() =>
      assertPerpTakerFeeConfig({ takerFeeApiBps: 0 }, true)
    ).not.toThrow()
    expect(() =>
      assertPerpTakerFeeConfig(
        { takerFeeApiBps: PERP_TAKER_FEE_API_BPS_MAX },
        true
      )
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
    for (const bad of [NaN, Infinity, -1, PERP_TAKER_FEE_API_BPS_MAX + 0.001])
      expect(() =>
        assertPerpTakerFeeConfig({ takerFeeApiBps: bad }, true)
      ).toThrow()
  })

  it('a corrupt API rate does not halt the web channel', () => {
    // The API rate governs API flow only. Failing closed on it for a web
    // open would take the market dark for every ordinary trader over a
    // field their trades never read.
    for (const bad of [NaN, Infinity, -1, PERP_TAKER_FEE_API_BPS_MAX + 0.001]) {
      expect(() =>
        assertPerpTakerFeeConfig({ takerFeeBps: 10, takerFeeApiBps: bad })
      ).not.toThrow()
      expect(getPerpEffectiveTakerFeeBps({ takerFeeBps: 10 }, false)).toBe(10)
    }
    // ...but a corrupt BASE still fails closed on both channels.
    expect(() =>
      assertPerpTakerFeeConfig({ takerFeeBps: NaN, takerFeeApiBps: 30 })
    ).toThrow()
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

  it('crosses the margin exactly at feeBps x leverage = 10_000', () => {
    // The engine rejects an open whose fee meets or exceeds its margin
    // (openFee >= mana). Because the fee is charged on NOTIONAL, that floor
    // is a pure statement about this function, so pin it here: the two
    // config domains are validated independently of maxLeverage, and this
    // is the arithmetic that decides whether a given pair is survivable.
    const mana = 1_000
    const feeAt = (bps: number, leverage: number) =>
      calcPerpTakerFee(mana * leverage, bps)

    // Honest settings sit far below the floor.
    expect(feeAt(PERP_TAKER_FEE_BPS_DEFAULT, 100)).toBeCloseTo(0.1 * mana, 10)
    expect(feeAt(30, 100)).toBeCloseTo(0.3 * mana, 10)

    // The boundary itself, from both sides.
    expect(feeAt(100, 100)).toBeCloseTo(mana, 10) // 100 x 100 = 10_000
    expect(feeAt(100, 99)).toBeLessThan(mana)
    expect(feeAt(101, 100)).toBeGreaterThan(mana)

    // The API domain crosses it well inside the allowed leverage range:
    // at the ceiling the floor is breached above ~33x, and at maxLeverage
    // 100 the fee would be 3x the margin posted.
    expect(feeAt(PERP_TAKER_FEE_API_BPS_MAX, 34)).toBeGreaterThan(mana)
    expect(feeAt(PERP_TAKER_FEE_API_BPS_MAX, 33)).toBeLessThan(mana)
    expect(feeAt(PERP_TAKER_FEE_API_BPS_MAX, 100)).toBeCloseTo(3 * mana, 10)
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
      existingPositionValue: 0,
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
      existingPositionValue: 0,
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
        // Fixed mark: every chunk merges at `price`, so entryPrice stays
        // `price`, π stays 0 and the value equals the cost basis — the cap
        // is inert and the telescoping is unaffected by it.
        existingPositionValue: position ? getPositionValue(position, price) : 0,
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
      existingPositionValue: 300_000,
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
      existingPositionValue: 50_000,
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
        existingPositionValue: 50_000,
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
        existingPositionValue: 50_000,
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
        existingPositionValue: 0,
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
      existingPositionValue: NaN,
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

// ---------------------------------------------------------------------------
// Mark-to-market own-contribution netting.
//
// `perpOpenFeeQuote` nets the trader's own standing contribution out of the
// depth. That contribution is `min(costBasis, positionValue) + takerFeeBasis`,
// NOT the raw cost basis: `costBasis` is the margin POSTED and is never marked
// to market, while the gross pool has already been reduced by every payout to
// a closing counterparty. Netting the raw basis deducts mana that has left the
// pool, and the fee is quadratic in 1/depth, so the error squares.
// ---------------------------------------------------------------------------
describe('perpOpenFeeQuote own-contribution is marked to market', () => {
  const base = 10
  const entryPrice = 100

  // Build the drawdown through the REAL transitions rather than hand-fed
  // numbers: two 1x traders, the mark falls, the winner closes — which is what
  // actually removes mana from the loser's pool.
  const buildDrawdown = (markAfter: number) => {
    let state: PerpState = { pool: { L: 50_000, S: 50_000 }, positions: [] }

    // W opens long 200k margin at 1x; flat 10 bps fee (impact was 0 then).
    const wOpen = openPosition(
      state,
      'W',
      'c1',
      'long',
      200_000,
      1,
      entryPrice,
      undefined,
      1
    )
    const wFee = calcPerpTakerFee(200_000, base)
    const wAccrued = accruePerpPositionTakerFee(
      wOpen.state,
      wOpen.position,
      wFee
    )
    state = creditPerpPoolFee(wAccrued.state, 'long', wFee)

    // B opens short 200k margin at 1x.
    const bOpen = openPosition(
      state,
      'B',
      'c1',
      'short',
      200_000,
      1,
      entryPrice,
      undefined,
      1
    )
    const bFee = calcPerpTakerFee(200_000, base)
    const bAccrued = accruePerpPositionTakerFee(
      bOpen.state,
      bOpen.position,
      bFee
    )
    state = creditPerpPoolFee(bAccrued.state, 'short', bFee)

    // The mark falls and B realizes. closePosition debits the LOSER's pool by
    // the winner's profit, so part of W's posted margin physically leaves.
    const b = state.positions.find((p) => p.userId === 'B') as PerpPosition
    state = closePosition(state, b, markAfter).state
    const w = state.positions.find((p) => p.userId === 'W') as PerpPosition
    return { state, w }
  }

  const quoteAdd = (
    state: PerpState,
    w: PerpPosition,
    mark: number,
    addedNotional: number,
    impact: number
  ) =>
    perpOpenFeeQuote({
      grossPoolDepth: state.pool.L + state.pool.S,
      existingSize: w.size,
      existingCostBasis: w.costBasis,
      existingPositionValue: getPositionValue(w, mark),
      existingTakerFeeCostBasis: w.takerFeeCostBasis ?? 0,
      addedNotional,
      baseBps: base,
      impact,
    })

  // The pre-fix expression, kept explicit so the regression is pinned rather
  // than merely described.
  const quoteAddNettingRawBasis = (
    state: PerpState,
    w: PerpPosition,
    addedNotional: number,
    impact: number
  ) =>
    perpOpenFeeQuote({
      grossPoolDepth: state.pool.L + state.pool.S,
      existingSize: w.size,
      existingCostBasis: w.costBasis,
      existingPositionValue: w.costBasis,
      existingTakerFeeCostBasis: w.takerFeeCostBasis ?? 0,
      addedNotional,
      baseBps: base,
      impact,
    })

  const quoteFresh = (
    state: PerpState,
    addedNotional: number,
    impact: number
  ) =>
    perpOpenFeeQuote({
      grossPoolDepth: state.pool.L + state.pool.S,
      existingSize: 0,
      existingCostBasis: 0,
      existingPositionValue: 0,
      existingTakerFeeCostBasis: 0,
      addedNotional,
      baseBps: base,
      impact,
    })

  it('builds the drawdown the fee has to price', () => {
    const { state, w } = buildDrawdown(60)
    // B's 80k profit came out of poolLong: 40% of W's posted margin is gone.
    expect(state.pool.L).toBeCloseTo(170_200, 6)
    expect(state.pool.S).toBeCloseTo(50_200, 6)
    expect(state.pool.L + state.pool.S).toBeCloseTo(220_400, 6)
    expect(w.costBasis).toBe(200_000)
    expect(w.takerFeeCostBasis).toBe(200)
    expect(getPositionValue(w, 60)).toBeCloseTo(120_000, 6)
  })

  it.each([
    // impact, marked fee, raw-basis fee, fresh-account fee
    [90, 811.23, 19_488.68, 20.49],
    [10, 107.91, 2_183.19, 20.05],
  ])(
    'prices an underwater add against the mana still in the pool (impact %i)',
    (impact, marked, rawBasis, fresh) => {
      const { state, w } = buildDrawdown(60)
      const add = 20_000

      // depth = 220,400 − (min(200,000, 120,000) + 200) = 100,200
      const q = quoteAdd(state, w, 60, add, impact)
      expect(q.fee).toBeCloseTo(marked, 2)
      expect(q.depthExhausted).toBe(false)

      // The regression: netting the raw basis leaves depth 20,200 instead of
      // 100,200 and charges ~97% of the M$20,000 margin.
      const regressed = quoteAddNettingRawBasis(state, w, add, impact)
      expect(regressed.fee).toBeCloseTo(rawBasis, 2)
      expect(regressed.fee / q.fee).toBeGreaterThan(20)

      // Still strictly dearer than a fresh account taking the same notional —
      // the standing position keeps the add on the upper integral segment.
      const freshQuote = quoteFresh(state, add, impact)
      expect(freshQuote.fee).toBeCloseTo(fresh, 2)
      expect(q.fee).toBeGreaterThan(freshQuote.fee)
      // ...but no longer by the ~1000x the raw basis produced.
      expect(regressed.fee / freshQuote.fee).toBeGreaterThan(100)
      expect(q.fee / freshQuote.fee).toBeLessThan(50)
    }
  )

  it('caps at cost basis, so a PROFITABLE holder is not over-netted', () => {
    // Value 260k > costBasis 200k. Unrealized profit is a claim on the
    // OPPOSING pool, not mana this trader posted, so it must not enlarge the
    // deduction (which would shrink the depth and overcharge them).
    const { state, w } = buildDrawdown(60)
    const capped = perpOpenFeeQuote({
      grossPoolDepth: state.pool.L + state.pool.S,
      existingSize: w.size,
      existingCostBasis: w.costBasis,
      existingPositionValue: 260_000,
      existingTakerFeeCostBasis: w.takerFeeCostBasis ?? 0,
      addedNotional: 20_000,
      baseBps: base,
      impact: 90,
    })
    expect(capped.fee).toBeCloseTo(
      quoteAddNettingRawBasis(state, w, 20_000, 90).fee,
      10
    )
  })

  it('nets only the fee basis when the position is worth nothing', () => {
    // Fully underwater: every mana of margin has been paid out, so only the
    // cash fees the trader paid in are still theirs.
    const { state, w } = buildDrawdown(60)
    const q = perpOpenFeeQuote({
      grossPoolDepth: state.pool.L + state.pool.S,
      existingSize: w.size,
      existingCostBasis: w.costBasis,
      existingPositionValue: 0,
      existingTakerFeeCostBasis: w.takerFeeCostBasis ?? 0,
      addedNotional: 20_000,
      baseBps: base,
      impact: 90,
    })
    // depth = gross − takerFeeCostBasis only.
    expect(q.fee).toBeCloseTo(183.83, 2)
    expect(q.fee).toBeGreaterThan(quoteFresh(state, 20_000, 90).fee)
    expect(q.depthExhausted).toBe(false)
  })

  it('is inert at a fixed mark, so chunk splitting still telescopes exactly', () => {
    // π = 0 while the mark never moves, so value === costBasis and the cap
    // changes nothing — the property the netting exists to guarantee.
    const price = 100
    const impact = 90
    const whole = 400_000
    const chunks = [1, 37_500, 112_499, 250_000]
    expect(chunks.reduce((a, b) => a + b, 0)).toBe(whole)

    let state: PerpState = { pool: { L: 250_000, S: 216_000 }, positions: [] }
    const oneShot = perpOpenFeeQuote({
      grossPoolDepth: state.pool.L + state.pool.S,
      existingSize: 0,
      existingCostBasis: 0,
      existingPositionValue: 0,
      existingTakerFeeCostBasis: 0,
      addedNotional: whole,
      baseBps: base,
      impact,
    }).fee

    let position: PerpPosition | undefined
    let total = 0
    for (const chunk of chunks) {
      const details = perpOpenFeeQuote({
        grossPoolDepth: state.pool.L + state.pool.S,
        existingSize: position?.size ?? 0,
        existingCostBasis: position?.costBasis ?? 0,
        existingPositionValue: position ? getPositionValue(position, price) : 0,
        existingTakerFeeCostBasis: position?.takerFeeCostBasis ?? 0,
        addedNotional: chunk,
        baseBps: base,
        impact,
      })
      // The cap is provably inert at every step, not just in aggregate.
      if (position)
        expect(getPositionValue(position, price)).toBeCloseTo(
          position.costBasis,
          6
        )
      const openRes = openPosition(
        state,
        'u',
        'c1',
        'long',
        chunk,
        1,
        price,
        position,
        1
      )
      const accrued = accruePerpPositionTakerFee(
        openRes.state,
        openRes.position,
        details.fee
      )
      state = creditPerpPoolFee(accrued.state, 'long', details.fee)
      position = accrued.position
      total += details.fee
    }
    expect(total).toBeCloseTo(oneShot, 6)
  })

  it('telescopes exactly for an UNDERWATER holder, where the cap is live', () => {
    // The load-bearing splitting test. Starting flat would make
    // positionValue === costBasis, so the assertion would pass just as well
    // against the raw-cost-basis netting it replaced — it would prove nothing
    // about the new branch. Starting from a drawdown keeps `min` pinned to
    // positionValue at every step.
    //
    // The invariant that makes it telescope is NOT "value equals basis": an
    // add of margin m raises costBasis by m AND positionValue by m (the new
    // tranche opens at the mark carrying π = 0, and mergedEntryPrice conserves
    // the old π), so their DIFFERENCE is constant at the drawdown and the
    // netted quantity still grows by exactly the margin the pool banked.
    const mark = 60
    const impact = 90
    const { state: start, w: w0 } = buildDrawdown(mark)
    const drawdown = w0.costBasis - getPositionValue(w0, mark)
    expect(drawdown).toBeCloseTo(80_000, 6)

    const whole = 20_000
    const chunks = [1, 4_999, 7_000, 8_000]
    expect(chunks.reduce((a, b) => a + b, 0)).toBe(whole)

    // Pinned as a literal, not recomputed: comparing the chunked total to a
    // one-shot from the same helper would agree under a regression too.
    const oneShot = quoteAdd(start, w0, mark, whole, impact).fee
    expect(oneShot).toBeCloseTo(811.231907, 6)

    let state = start
    let position: PerpPosition | undefined = w0
    let total = 0
    for (const chunk of chunks) {
      // The cap is pinned to positionValue for the whole walk, and the
      // drawdown never moves — this is the property, asserted every step.
      const value = getPositionValue(position as PerpPosition, mark)
      expect(value).toBeLessThan((position as PerpPosition).costBasis)
      expect((position as PerpPosition).costBasis - value).toBeCloseTo(
        drawdown,
        6
      )

      const details = perpOpenFeeQuote({
        grossPoolDepth: state.pool.L + state.pool.S,
        existingSize: (position as PerpPosition).size,
        existingCostBasis: (position as PerpPosition).costBasis,
        existingPositionValue: value,
        existingTakerFeeCostBasis:
          (position as PerpPosition).takerFeeCostBasis ?? 0,
        addedNotional: chunk,
        baseBps: base,
        impact,
      })
      const openRes = openPosition(
        state,
        'W',
        'c1',
        'long',
        chunk,
        1,
        mark,
        position,
        1
      )
      const accrued = accruePerpPositionTakerFee(
        openRes.state,
        openRes.position,
        details.fee
      )
      state = creditPerpPoolFee(accrued.state, 'long', details.fee)
      position = accrued.position
      total += details.fee
    }

    expect(total).toBeCloseTo(oneShot, 6)
    expect(total).toBeCloseTo(811.231907, 6)
    // The drawdown survives the whole sequence.
    expect(
      (position as PerpPosition).costBasis -
        getPositionValue(position as PerpPosition, mark)
    ).toBeCloseTo(drawdown, 6)

    // And the regression is genuinely excluded: netting the raw basis over
    // the same chunks telescopes too, but to a completely different total.
    let rawState = start
    let rawPosition: PerpPosition | undefined = w0
    let rawTotal = 0
    for (const chunk of chunks) {
      const details = perpOpenFeeQuote({
        grossPoolDepth: rawState.pool.L + rawState.pool.S,
        existingSize: (rawPosition as PerpPosition).size,
        existingCostBasis: (rawPosition as PerpPosition).costBasis,
        existingPositionValue: (rawPosition as PerpPosition).costBasis,
        existingTakerFeeCostBasis:
          (rawPosition as PerpPosition).takerFeeCostBasis ?? 0,
        addedNotional: chunk,
        baseBps: base,
        impact,
      })
      const openRes = openPosition(
        rawState,
        'W',
        'c1',
        'long',
        chunk,
        1,
        mark,
        rawPosition,
        1
      )
      const accrued = accruePerpPositionTakerFee(
        openRes.state,
        openRes.position,
        details.fee
      )
      rawState = creditPerpPoolFee(accrued.state, 'long', details.fee)
      rawPosition = accrued.position
      rawTotal += details.fee
    }
    expect(rawTotal).toBeCloseTo(
      quoteAddNettingRawBasis(start, w0, whole, impact).fee,
      6
    )
    expect(rawTotal / total).toBeGreaterThan(20)
  })
  it('separates true exhaustion from the drawdown that only looked like it', () => {
    // Deeper drawdown: the winner realizes at 20, so 160k of W's margin has
    // left poolLong. The RAW basis reads this as exhausted and hard-rejects
    // the add, even though poolLong alone covers W's whole remaining claim
    // twice over.
    const { state, w } = buildDrawdown(20)
    expect(state.pool.L).toBeCloseTo(90_200, 6)
    expect(state.pool.L + state.pool.S).toBeCloseTo(140_400, 6)
    expect(getPositionValue(w, 20)).toBeCloseTo(40_000, 6)
    expect(state.pool.L).toBeGreaterThan(getPositionValue(w, 20) * 2)

    expect(quoteAddNettingRawBasis(state, w, 20_000, 90).depthExhausted).toBe(
      true
    )
    const q = quoteAdd(state, w, 20, 20_000, 90)
    expect(q.depthExhausted).toBe(false)
    expect(q.fee).toBeCloseTo(811.23, 2)

    // Genuine exhaustion still flags: the escrow cannot cover even the
    // holder's marked claim, so the size fee has no denominator.
    expect(
      perpOpenFeeQuote({
        grossPoolDepth: 10_000,
        existingSize: 50_000,
        existingCostBasis: 50_000,
        existingPositionValue: 50_000,
        existingTakerFeeCostBasis: 0,
        addedNotional: 20_000,
        baseBps: base,
        impact: 90,
      }).depthExhausted
    ).toBe(true)
  })

  it('never lets an untrustworthy mark buy a discount', () => {
    // A value we cannot trust falls back to the full cost basis (the old,
    // strictly HIGHER-fee behaviour). Falling back to 0 would make a corrupt
    // or omitted mark the cheapest input there is.
    const { state, w } = buildDrawdown(60)
    const rawBasisFee = quoteAddNettingRawBasis(state, w, 20_000, 90).fee
    for (const bad of [NaN, Infinity, -Infinity, -1]) {
      const q = perpOpenFeeQuote({
        grossPoolDepth: state.pool.L + state.pool.S,
        existingSize: w.size,
        existingCostBasis: w.costBasis,
        existingPositionValue: bad,
        existingTakerFeeCostBasis: w.takerFeeCostBasis ?? 0,
        addedNotional: 20_000,
        baseBps: base,
        impact: 90,
      })
      expect(q.fee).toBeCloseTo(rawBasisFee, 10)
      expect(q.fee).toBeGreaterThan(quoteAdd(state, w, 60, 20_000, 90).fee)
    }
  })

  it('does not double-subtract the closed leg on a flip', () => {
    // A flip closes the OPPOSITE side, so there is no standing same-side row:
    // the payout is already out of the gross depth and the own-contribution
    // fields are all zero. Subtracting the closed position's value again
    // would understate the depth and overcharge the new leg.
    const { state } = buildDrawdown(60)
    const w = state.positions.find((p) => p.userId === 'W') as PerpPosition
    const afterClose = closePosition(state, w, 60)
    const grossAfterClose = afterClose.state.pool.L + afterClose.state.pool.S
    // The payout that leaves the pool IS getPositionValue — the same quantity
    // the panel subtracts for a flip preview.
    expect(afterClose.payout).toBeCloseTo(getPositionValue(w, 60), 6)
    expect(grossAfterClose).toBeCloseTo(220_400 - afterClose.payout, 6)

    const newLeg = perpOpenFeeQuote({
      grossPoolDepth: grossAfterClose,
      existingSize: 0,
      existingCostBasis: 0,
      existingPositionValue: 0,
      existingTakerFeeCostBasis: 0,
      addedNotional: 20_000,
      baseBps: base,
      impact: 90,
    })
    // Identical to a fresh account opening the same notional on that pool.
    expect(newLeg.fee).toBeCloseTo(
      quoteFresh(afterClose.state, 20_000, 90).fee,
      10
    )
    // Subtracting the closed leg a SECOND time is wrong in both regimes.
    // Partially: the depth shrinks and the new leg is overcharged.
    const partiallyOverSubtracted = perpOpenFeeQuote({
      grossPoolDepth: grossAfterClose,
      existingSize: 0,
      existingCostBasis: 60_000,
      existingPositionValue: 60_000,
      existingTakerFeeCostBasis: 0,
      addedNotional: 20_000,
      baseBps: base,
      impact: 90,
    })
    expect(partiallyOverSubtracted.fee).toBeGreaterThan(newLeg.fee)

    // Fully: the depth goes past zero and the quote collapses into the
    // base-only exhausted fallback — an UNDERcharge that would also trip the
    // engine's fail-closed reject on a perfectly healthy flip.
    const fullyOverSubtracted = perpOpenFeeQuote({
      grossPoolDepth: grossAfterClose,
      existingSize: 0,
      existingCostBasis: getPositionValue(w, 60),
      existingPositionValue: getPositionValue(w, 60),
      existingTakerFeeCostBasis: 0,
      addedNotional: 20_000,
      baseBps: base,
      impact: 90,
    })
    expect(fullyOverSubtracted.depthExhausted).toBe(true)
    expect(fullyOverSubtracted.fee).toBeCloseTo(
      calcPerpTakerFee(20_000, base),
      10
    )
    expect(fullyOverSubtracted.fee).toBeLessThan(newLeg.fee)
  })

  // Why a client must gate on RAW contract/position fields rather than on
  // Number.isFinite of the derived ones: every helper on this path is
  // deliberately total, so each launders bad input into a finite-looking
  // value. The engine throws on all three, so previewing them promises a
  // trade that cannot succeed.
  it('launders bad input into finite-looking values, so output checks are not a gate', () => {
    // Pools: non-finite or negative collapse to 0, not to NaN.
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -1])
      expect(getPerpBackingPool(bad, 100_000)).toBe(0)

    // Config: out-of-range values read as the platform defaults...
    expect(getPerpTakerFeeBps({ takerFeeBps: 5_000 })).toBe(
      PERP_TAKER_FEE_BPS_DEFAULT
    )
    expect(getPerpTakerFeeImpact({ takerFeeImpact: 1e9 })).toBe(
      PERP_TAKER_FEE_IMPACT_DEFAULT
    )
    // ...while the engine's own guard rejects the same contract outright.
    expect(() => assertPerpTakerFeeConfig({ takerFeeBps: 5_000 })).toThrow()
    expect(() => assertPerpTakerFeeConfig({ takerFeeImpact: 1e9 })).toThrow()

    // Position: a non-positive entryPrice marks as FLAT rather than NaN.
    const corrupt: PerpPosition = {
      userId: 'W',
      contractId: 'c1',
      direction: 'long',
      size: 200_000,
      costBasis: 200_000,
      originalCostBasis: 200_000,
      takerFeeCostBasis: 200,
      entryPrice: 0,
      leverage: 1,
      liquidationPrice: 0,
      openedTime: 1,
      updatedTime: 1,
    }
    expect(getPositionValue(corrupt, 60)).toBe(200_000)
    expect(Number.isFinite(getPositionValue(corrupt, 60))).toBe(true)
    expect(() => assertPerpPositionNumbers(corrupt)).toThrow()

    // And the quote built from those laundered inputs looks perfectly
    // ordinary — a base-only fee with no flag raised. That is the number a
    // client would otherwise display and derive its maxFee from.
    const laundered = perpOpenFeeQuote({
      grossPoolDepth: getPerpBackingPool(Number.NaN, 100_000),
      existingSize: 0,
      existingCostBasis: 0,
      existingPositionValue: 0,
      existingTakerFeeCostBasis: 0,
      addedNotional: 20_000,
      baseBps: getPerpTakerFeeBps({ takerFeeBps: 5_000 }),
      impact: getPerpTakerFeeImpact({ takerFeeImpact: 1e9 }),
    })
    expect(Number.isFinite(laundered.fee)).toBe(true)
    expect(laundered.depthExhausted).toBe(false)
    expect(laundered.fee).toBeCloseTo(
      calcPerpTakerFee(20_000, PERP_TAKER_FEE_BPS_DEFAULT),
      10
    )
  })
})

// The impure half of the fee inputs. Until this was extracted it lived
// copy-pasted in engine.ts and perp-bet-panel.tsx and was pinned by NOTHING:
// substituting `position.costBasis` for `getPositionValue(position, price)` —
// a complete revert of the mark-to-market fix — type-checked and left the
// whole suite green while charging 24x the correct fee.
describe('perpOwnContributionInputs', () => {
  const price = 60
  const held: PerpPosition = {
    userId: 'W',
    contractId: 'c1',
    direction: 'long',
    size: 200_000,
    costBasis: 200_000,
    originalCostBasis: 200_000,
    takerFeeCostBasis: 200,
    entryPrice: 100,
    leverage: 1,
    liquidationPrice: 0,
    openedTime: 1,
    updatedTime: 1,
  }

  it('marks the standing contribution to market rather than reporting the posted margin', () => {
    const inputs = perpOwnContributionInputs(held, price)
    expect(inputs).toEqual({
      existingSize: 200_000,
      existingCostBasis: 200_000,
      // 40% underwater: costBasis + π = 200,000 − 80,000.
      existingPositionValue: 120_000,
      existingTakerFeeCostBasis: 200,
    })
    // The distinction the whole change rests on.
    expect(inputs.existingPositionValue).not.toBe(held.costBasis)
    expect(inputs.existingPositionValue).toBe(getPositionValue(held, price))
  })

  it('feeds the quote the fee the engine actually charges', () => {
    // End-to-end through the real assembly, on the drawdown fixture's pools.
    const quoted = perpOpenFeeQuote({
      grossPoolDepth: 220_400,
      ...perpOwnContributionInputs(held, price),
      addedNotional: 20_000,
      baseBps: 10,
      impact: 90,
    })
    expect(quoted.fee).toBeCloseTo(811.231907, 6)

    // Substituting the posted margin — the pre-fix expression — is a 24x
    // overcharge that does NOT fail closed: depth stays 20,200 > 0 so
    // depthExhausted is false, and 19,488.68 < 20,000 so the fee<margin
    // reject never fires. The trade completes at 97.4% of margin.
    const reverted = perpOpenFeeQuote({
      grossPoolDepth: 220_400,
      existingSize: held.size,
      existingCostBasis: held.costBasis,
      existingPositionValue: held.costBasis,
      existingTakerFeeCostBasis: held.takerFeeCostBasis ?? 0,
      addedNotional: 20_000,
      baseBps: 10,
      impact: 90,
    })
    expect(reverted.fee).toBeCloseTo(19_488.679541, 6)
    expect(reverted.depthExhausted).toBe(false)
    expect(reverted.fee).toBeLessThan(20_000)
    expect(reverted.fee / quoted.fee).toBeCloseTo(24.02, 2)
  })

  it('tracks the mark, so the same position quotes differently as price moves', () => {
    // Guards against any implementation that ignores `price`.
    expect(perpOwnContributionInputs(held, 100).existingPositionValue).toBe(
      200_000
    )
    expect(perpOwnContributionInputs(held, 60).existingPositionValue).toBe(
      120_000
    )
    expect(perpOwnContributionInputs(held, 20).existingPositionValue).toBe(
      40_000
    )
  })

  it('is all zeros for a fresh open or a flip’s new leg', () => {
    // A flip's closed leg has already left grossPoolDepth via its payout, so
    // it must not be subtracted here as well.
    expect(perpOwnContributionInputs(undefined, price)).toEqual({
      existingSize: 0,
      existingCostBasis: 0,
      existingPositionValue: 0,
      existingTakerFeeCostBasis: 0,
    })
  })

  it('treats a missing fee basis as 0 without disturbing the rest', () => {
    const { takerFeeCostBasis: _omitted, ...noFeeBasis } = held
    expect(
      perpOwnContributionInputs(noFeeBasis as PerpPosition, price)
    ).toMatchObject({
      existingTakerFeeCostBasis: 0,
      existingPositionValue: 120_000,
    })
  })

  it('propagates a non-finite mark rather than laundering it — the engine rejects on this', () => {
    expect(
      Number.isFinite(
        perpOwnContributionInputs(held, Number.NaN).existingPositionValue
      )
    ).toBe(false)
  })
})

describe('perpMaxFeeFor (fee slippage band)', () => {
  it('is the previewed fee plus PERP_FEE_SLIPPAGE_BPS of NOTIONAL', () => {
    // 10 bps of 500,000 = M$500 of room on top of the quote.
    expect(perpMaxFeeFor(3_102, 500_000)).toBeCloseTo(3_602, 2)
    expect(perpMaxFeeFor(789, 500_000)).toBeCloseTo(1_289, 2)
  })

  it('keeps "free" meaning free — a zero preview authorises exactly zero', () => {
    // A client whose config is stale (impact just enabled) must not silently
    // consent to a fee it never displayed.
    expect(perpMaxFeeFor(0, 500_000)).toBe(0)
    expect(perpMaxFeeFor(-1, 500_000)).toBe(0)
    expect(perpMaxFeeFor(Number.NaN, 500_000)).toBe(0)
  })

  it('degrades to the bare fee when the notional is degenerate', () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY])
      expect(perpMaxFeeFor(100, bad)).toBeCloseTo(100, 2)
  })

  it('holds its tolerable pool move as the trade grows, where the old band did not', () => {
    // The regression this replaces. The old band granted room proportional to
    // the FEE, but the fee's sensitivity to a pool move grows faster than the
    // fee does (the impact term goes as 1/depth^2), so the pool move the band
    // could actually absorb SHRANK as the trade grew — tightest on exactly the
    // pool-scale entries the impact fee exists to price.
    const gross = 379_611.25 // live BTC book
    const feeAt = (notional: number, depth: number, impact: number) => {
      const s = notional / depth
      return (notional * 10) / 10_000 + ((impact / 3) * depth * s ** 3) / 10_000
    }
    const oldBand = (fee: number) => Math.ceil(fee * 1.01 * 100) / 100 + 0.01
    // Largest outflow this band survives, as a fraction of the pool.
    const tolerableDrop = (notional: number, bound: number) => {
      let lo = gross * 0.3
      let hi = gross
      for (let i = 0; i < 300; i++) {
        const mid = (lo + hi) / 2
        if (feeAt(notional, mid, 90) > bound) lo = mid
        else hi = mid
      }
      return 1 - hi / gross
    }
    const small = 200_000
    const large = 1_000_000
    const oldSmall = tolerableDrop(small, oldBand(feeAt(small, gross, 90)))
    const oldLarge = tolerableDrop(large, oldBand(feeAt(large, gross, 90)))
    // Old: the bigger trade tolerated LESS drift (~1.09% vs ~0.52%).
    expect(oldLarge).toBeLessThan(oldSmall)
    expect(oldLarge).toBeLessThan(0.006)

    const newSmall = tolerableDrop(
      small,
      perpMaxFeeFor(feeAt(small, gross, 90), small)
    )
    const newLarge = tolerableDrop(
      large,
      perpMaxFeeFor(feeAt(large, gross, 90), large)
    )
    // New: both absorb far more, and the large trade is no longer the fragile
    // one by an order of magnitude.
    expect(newSmall).toBeGreaterThan(oldSmall * 10)
    expect(newLarge).toBeGreaterThan(oldLarge * 4)
    // Room granted per unit of size is constant by construction.
    for (const c of [
      { notional: small, fee: feeAt(small, gross, 90) },
      { notional: large, fee: feeAt(large, gross, 90) },
    ])
      expect(
        ((perpMaxFeeFor(c.fee, c.notional) - c.fee) / c.notional) * 10_000
      ).toBeCloseTo(PERP_FEE_SLIPPAGE_BPS, 1)
  })

  it('absorbs the pool drift that actually occurs on a live book', () => {
    // BTC gross 379,611; median 5s outflow M$300, p95 M$39,412. At the launch
    // impact of 10 a M$500k entry must stay quotable across ordinary drift.
    const gross = 379_611.25
    const feeAt = (notional: number, depth: number, impact: number) => {
      const s = notional / depth
      return (notional * 10) / 10_000 + ((impact / 3) * depth * s ** 3) / 10_000
    }
    const notional = 500_000
    const quoted = feeAt(notional, gross, 10)
    const bound = perpMaxFeeFor(quoted, notional)
    // p95 outflow leaves; the fee must still be inside the band.
    expect(feeAt(notional, gross - 39_412, 10)).toBeLessThan(bound)
    // The band is not unlimited: a catastrophic drain still rejects.
    expect(feeAt(notional, gross - 200_000, 10)).toBeGreaterThan(bound)
  })
})

describe('PERP_MAX_FEE_SHARE_OF_MARGIN', () => {
  // The fee is charged on NOTIONAL but bites MARGIN, and leverage is the
  // multiplier: fee/margin = effectiveBps * leverage / 10_000. These pin the
  // reachability that justifies the bound, so a later change to the constant
  // or to maxLeverage has to confront it.
  const base = 10
  const impact = 10
  const effBpsAtShare = (S: number) => base + (impact / 3) * S * S
  const feeShareOfMargin = (S: number, leverage: number) =>
    (effBpsAtShare(S) * leverage) / 10_000

  it('is half the margin', () => {
    expect(PERP_MAX_FEE_SHARE_OF_MARGIN).toBe(0.5)
  })

  it('costs nothing in false rejections below extreme leverage', () => {
    // The OI cap (PERP_OPEN_INTEREST_COVER_MULTIPLE = 10, against the
    // UNRESERVED OPPOSING pool) holds a roughly balanced book to about
    // S <= 5. At that size the bound is clear through leverage 50 and only
    // bites at 100.
    const maxRealisticShare = 5
    for (const leverage of [1, 3, 10, 20, 50])
      expect(feeShareOfMargin(maxRealisticShare, leverage)).toBeLessThan(
        PERP_MAX_FEE_SHARE_OF_MARGIN
      )
    expect(feeShareOfMargin(maxRealisticShare, 100)).toBeGreaterThan(
      PERP_MAX_FEE_SHARE_OF_MARGIN
    )
  })

  it('pins the pool share at which each leverage first trips the bound', () => {
    // Stated explicitly so that raising maxLeverage, or retuning the bound,
    // has to confront what it makes unreachable.
    const shareAtBound = (leverage: number) =>
      Math.sqrt(
        ((PERP_MAX_FEE_SHARE_OF_MARGIN * 10_000) / leverage - base) /
          (impact / 3)
      )
    expect(shareAtBound(10)).toBeCloseTo(12.12, 2)
    expect(shareAtBound(20)).toBeCloseTo(8.49, 2)
    expect(shareAtBound(50)).toBeCloseTo(5.2, 1)
    expect(shareAtBound(100)).toBeCloseTo(3.46, 2)
  })

  it('bites exactly where extreme leverage meets extreme size', () => {
    // 100x on a position 3.5x the backing pool — roughly the largest short
    // BTC's OI cap allowed on 2026-08-21 — costs 51% of margin, so the bound
    // catches it. The old 1.0 bound did not.
    const S = 3.51
    const share = feeShareOfMargin(S, 100)
    expect(share).toBeGreaterThan(0.5)
    expect(share).toBeLessThan(1)
    expect(share).toBeCloseTo(0.511, 3)
  })

  it('tightens the fat-fingered channel-rate case', () => {
    // A flat rate alone (no size term) trips the bound at
    // leverage >= 0.5 * 10_000 / rate. At the top of the API range that is
    // 17x, where the old 1.0 bound needed 33x.
    const topApiRate = 300
    const leverageAtNewBound =
      (PERP_MAX_FEE_SHARE_OF_MARGIN * 10_000) / topApiRate
    const leverageAtOldBound = 10_000 / topApiRate
    expect(leverageAtNewBound).toBeCloseTo(16.67, 2)
    expect(leverageAtOldBound).toBeCloseTo(33.33, 2)
  })

  it('clears the corrected fee but would have caught the pre-fix one', () => {
    const margin = 20_000
    // The drawdown fixture's corrected add: M$811.23 on M$20,000 of margin.
    expect(811.231907 / margin).toBeLessThan(PERP_MAX_FEE_SHARE_OF_MARGIN)
    // And the pre-fix charge it replaced, which the old bound let through.
    expect(19_488.679541 / margin).toBeLessThan(1)
    expect(19_488.679541 / margin).toBeGreaterThan(PERP_MAX_FEE_SHARE_OF_MARGIN)
  })
})
