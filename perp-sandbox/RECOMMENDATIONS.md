# Perp risk recalibration — recommended config

Measured against `main` @ 810c71950 and prod data pulled 2026-08-18/19.
Reproducible with the sandbox here (`yarn design`, `yarn house`, `yarn burn`,
`yarn replay`, `yarn validate`).

**Nothing here has been applied to a live market.** These are recommendations.

---

## What is actually live (verified on main, 2026-08-19)

| Charge | Base | Where | Status |
|---|---|---|---|
| Taker fee | **NOTIONAL** | `calcPerpTakerFee(mana * leverage, bps)` — engine.ts:641 | **LIVE** |
| Funding | **MARGIN** | `delta = f * state.pool.L` — amm.ts `applyFunding` | **not notional** |

This split is the single most important fact for reading the rest of this file.
Fees moved to notional in #3979. **Funding did not.** The pool holds margin, so
`f * pool` is a charge on margin, and every drift-based leverage cap below
exists *only* because of that.

Do not apply the "if notional funding ships" column to the system as it stands.
Its caps are up to 24x looser and they assume a charge that is not being made.

---

## Config to apply TODAY (funding on margin)

| Market | Status | sigma/day | Drift/yr | Vol cap | Drift cap | **Leverage** | f_max | takerFeeBps |
|---|---|---|---|---|---|---|---|---|
| BTC | live | 2.43% | ~0 | 20.6x | — | **100x -> 20x** | 200%/yr keep | set **10** explicitly |
| OpenRouter share | live | 2.09% | **+121.6%** | 23.9x | **0.8x** | **100x -> 2x** | **100% -> 600%/yr** | set 10 |
| Trump approval | live | 0.86% | −4.9% | 58.1x | 20.4x | **100x -> 20x** | 100%/yr keep | set 10 |
| SPY | feed live, no market | 1.01%* | +8%* | 49.5x | 25.0x | **25x** | 200%/yr | 10 |
| QQQ | feed live, no market | 1.40%* | +11%* | 35.7x | 18.2x | **18x** | 200%/yr | 10 |
| GOLD | feed live, no market | 0.95%* | +5%* | 52.6x | 40.0x | **40x** | 200%/yr | 10 |
| NVDA | feed live, no market | 3.20%* | +15%* | 15.6x | 13.3x | **10x** | 200%/yr | 10 |
| Manifold DAU | — | **25.4%** | +381.7% | 2.0x | 0.5x | **do not launch** | — | — |

`*` = assumption. The four xStocks feeds were hours old when measured, so their
sigma and drift are long-run estimates. Everything unmarked is measured from
`oracle_prices` over 198–200 days. NVDA is set below its drift cap because of
earnings gaps (below).

### Why two caps

Two independent constraints bind leverage; take the smaller.

- **Volatility.** Liquidation sits `1/L` from entry, so ordinary noise must not
  reach it: `L <= 1 / (2 * sigma_daily)`.
- **Drift.** With funding on MARGIN, a long earns drift on notional but pays
  funding on margin, so break-even is `f = mu * L`, giving `L <= f_max / |drift|`.

They bind different assets, which is why one cap everywhere is wrong in both
directions: BTC is volatility-constrained and driftless; SPY is the reverse.

---

## If funding moves to notional

Under a notional charge the drift term cancels out of the break-even entirely:

```
margin  (today):  EV = m*(mu*L - f)   -> break-even f = mu*L  -> L <= f_max/mu
notional:         EV = m*L*(mu - f)   -> break-even f = mu    -> L unbounded by drift
```

Only the volatility cap would remain:

| Market | Cap today (margin) | Cap if notional (vol only) |
|---|---|---|
| BTC | 20x | 21x |
| OpenRouter | 1x | **24x** |
| Trump | 20x | **58x** |
| SPY | 25x | **50x** |
| QQQ | 18x | **36x** |
| GOLD | 40x | **53x** |
| NVDA | 13x (10x for gaps) | 16x |
| Manifold DAU | 1x | 2x — still do not launch |

**`f_max` must be re-based at the same time, downward.** A trader would pay
`f * notional`, which at leverage `L` is `f * L` on their margin:

| f_max on notional | cost to a 1x holder | cost to a 100x holder at the cap |
|---|---|---|
| 20%/yr | 20%/yr | 2,000%/yr |
| 50%/yr | 50%/yr | 5,000%/yr |
| 200%/yr | 200%/yr | **20,000%/yr** |

Real venues run roughly 10–30%/yr on notional, so ~50%/yr would already be
generous and today's 200%/yr would be punitive. Against a 50%/yr notional cap,
`f_max >= drift / I(r)` at a target ratio of r=2:

| Market | drift | f_max needed | covered by 50%/yr? |
|---|---|---|---|
| Trump | 4.9% | 10%/yr | yes |
| GOLD | 5.0% | 10%/yr | yes |
| SPY | 8.0% | 16%/yr | yes |
| QQQ | 11.0% | 22%/yr | yes |
| NVDA | 15.0% | 30%/yr | yes |
| **OpenRouter** | 121.6% | **243%/yr** | **NO** |
| **Manifold DAU** | 381.7% | **763%/yr** | **NO** |

So notional funding fixes the equities and gold outright, and still does not
fix OpenRouter or DAU — their drift exceeds any sane cap on either base.

Second-order effect: the transfer base changes from pool to open interest,
which on BTC is **2.1x larger** per tick at the same rate. Draining that much
faster is another reason `f_max` comes down, not up.

---

## Oracle cadence

BTC is already 5s on main. The four xStocks feeds are 15s. Measured inter-tick
gaps over five hours, 2026-08-18:

| Feed | Configured | Median | Mean | Max | Gaps >60s | Flat prints |
|---|---|---|---|---|---|---|
| btc-usd | 5s | 9.9s | 11.7s | 75s | 13 | 13 |
| spyx-usd | 15s | 15.2s | 27.4s | 165s | 51 | 11 |
| qqqx-usd | 15s | 22.6s | 38.6s | 165s | 95 | 11 |
| gldx-usd | 15s | 30.0s | 67.5s | **795s** | 91 | 42 |
| nvdax-usd | 15s | **59.8s** | 70.7s | 165s | 115 | 45 |

None meets its configured cadence, and flat-print counts are low enough that
these are genuine skipped ticks, not deduplicated unchanged prices. Lowering
the poll before fixing that spends request budget for no extra freshness — and
a stalled feed pauses its market, which is worse than a stale mark.

Scalping edge scales with `sqrt(dt)`, so a faster tick gains less than it looks
and the taker fee is already carrying the load:

| Tick | Edge/round trip | vs 10 bps fee |
|---|---|---|
| 15s | 1.50 bps | 6.7x cover |
| 10s (BTC actual) | 1.22 bps | 8.2x cover |
| 5s | 0.87 bps | 11.5x cover |

**Sequence:** batch Jupiter (done on this branch) -> diagnose the residual 15s
shortfall -> flip `updatePeriodMs`/`pollPeriodMs` and verify the median gap
actually lands near 5s. Separately, find out why BTC delivers 9.9s on a 5s poll.

---

## Manifold DAU — three independent blockers

- **Weekday seasonality no funding base fixes.** Monday averages **+6.45%**
  (t = 5.92), Saturday −4.91% (t = −4.89), Tuesday −3.55% (t = −3.52). Maximum
  funding chargeable over one day at `f_max` and infinite imbalance is 0.547%.
  Monday alone is 11.8x the cap; break-even leverage is 0.085x. Under *notional*
  funding break-even is `f = mu` = 6.45%/day = 2,354%/yr — still 11.8x the cap.
- **sigma = 25.4%/day** on the live `manifold-dau` feed, ten times BTC's.
- **The pipeline is broken.** `daily_stats` last wrote 2026-08-01, 21 rows in 30
  days. `manifold-dau` also writes to `oracle_prices` but is NOT in
  `ORACLE_FEEDS`, and its values (11.9k–56.3k) do not match `daily_stats.dau`
  (659–2,081) — they measure different things.

A 7-day trailing-average oracle removes the seasonality by construction. Fix the
pipeline and re-measure first.

---

## NVDA earnings gaps

Bad debt is `(gap - 1/L) * crowded OI`, per year, at 600k of crowded-side OI:

| Leverage | Liq buffer | 8% gap | 15% gap | 20% gap |
|---|---|---|---|---|
| 100x | 1.00% | 168,000 | 336,000 | 456,000 |
| 25x | 4.00% | 96,000 | 264,000 | 384,000 |
| 10x | 10.00% | 0 | 120,000 | 240,000 |
| 5x | 20.00% | 0 | 0 | 0 |

The one market where 100x has a directly calculable cost rather than just more
variance. Unaffected by the funding base.

---

## Ranked by effect on how long the pool lasts

House signal-to-noise is `(turnover * fee) / (net-OI fraction * volatility)` — a
ratio with **no size term**. Adding liquidity scales winnings and risk equally;
it never changes the odds.

1. **Set `takerFeeBps` explicitly on every market.** All four live contracts
   have it `null`, falling through to the default of 10. It is already charged
   on notional and is the only systematic inflow — it should be a stated number.
2. **Per-market leverage caps** from the TODAY table. This is the lever that
   moves net OI, the multiplier on every risk term.
3. **Move funding to notional**, re-basing `f_max` downward at the same time.
   Collapses the drift constraint for every market except OpenRouter and DAU.
4. **Track house P&L explicitly.** Subsidy, accrued fees and retained
   liquidation margin are indistinguishable inside `poolLong`/`poolShort`.
5. **Liquidate at a maintenance margin above zero.** Positions liquidate at
   exactly zero equity today, so the house absorbs gap risk uncompensated.

---

## Limitations

- SPY/QQQ/GOLD/NVDA sigma and drift are assumptions; every cap moves with them.
- Drift over one window is not forward drift. OpenRouter's +121.6% cannot
  persist against a 100% ceiling — directions are more reliable than magnitudes.
- Oracle gap stats cover one five-hour window on feeds hours old. Re-measure
  over a full week including a weekend.
- House P&L assumes uninformed flow. Two bots already extracted ~M$70k in ~30h
  at ~1.5 bps per round trip.
- DAU seasonality comes from `daily_stats`, which is itself stale.
