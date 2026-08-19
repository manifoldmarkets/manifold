# Perp risk recalibration — recommended config

Measured against `main` @ 810c71950 and prod data pulled 2026-08-18/19.
Derivations are reproducible with the sandbox in this directory
(`yarn design`, `yarn house`, `yarn burn`, `yarn replay`).

**Nothing here has been applied to a live market.** These are recommendations.

## Per-market config

| Market | Status | σ/day | Drift/yr | Vol cap | Drift cap | Leverage | f_max | takerFeeBps |
|---|---|---|---|---|---|---|---|---|
| BTC | live | 2.43% | ~0 | 20.5× | — | **100× → 20×** | 200%/yr keep | **set 10 explicitly** |
| OpenRouter share | live | 2.09% | **+121.6%** | 23.9× | **1.6×** | **100× → 2×** | **100% → 600%/yr** | set 10 |
| Trump approval | live | 0.86% | −4.9% | 58.2× | 40.8× | **100× → 25×** | 100%/yr keep | set 10 |
| SPY | feed live, no market | 1.01%* | +8%* | 49.6× | 25.0× | **25×** | 200%/yr | 10 |
| QQQ | feed live, no market | 1.40%* | +11%* | 36.1× | 18.2× | **18×** | 200%/yr | 10 |
| GOLD | feed live, no market | 0.95%* | +5%* | 52.9× | 39.9× | **40×** | 200%/yr | 10 |
| NVDA | feed live, no market | 3.20%* | +15%* | 15.9× | 13.3× | **10×** | 200%/yr | 10 |
| Manifold DAU | — | **25.4%** | +381.7% | 2.0× | 0.5× | **do not launch** | — | — |

`*` = assumption. The four xStocks feeds were hours old when measured, so their
σ and drift are long-run estimates. Everything unmarked is measured from
`oracle_prices` over 198–200 days.

## Why two caps

Two independent constraints bind leverage; take the smaller.

- **Volatility.** Liquidation sits `1/L` from entry, so ordinary noise must not
  reach it: `L ≤ 1 / (2 · σ_daily)`.
- **Drift.** Under funding charged on MARGIN, a long earns drift on notional but
  pays funding on margin, so break-even is `f = μ · L` and therefore
  `L ≤ f_max_annual / |drift|`.

They bind different assets, which is why one cap for every market is wrong in
both directions: BTC is volatility-constrained and driftless; SPY is the reverse.

## The drift cap is an artefact of charging funding on margin

Under funding charged on NOTIONAL instead:

```
margin-based:    EV = m·(μ·L − f)   → break-even f = μ·L   → L ≤ f_max/μ
notional-based:  EV = m·L·(μ − f)   → break-even f = μ     → L unbounded by drift
```

Leverage cancels. The required `f_max` stops depending on leverage entirely:

| Market | drift | f_max needed, MARGIN-based @100× | f_max needed, NOTIONAL-based |
|---|---|---|---|
| OpenRouter | +121.6%/yr | 12,160%/yr | **121.6%/yr** |
| NVDA | +15%/yr | 1,500%/yr | **15%/yr** |
| SPY | +8%/yr | 800%/yr | **8%/yr** |

So switching the funding base removes the drift constraint outright and leaves
only the volatility cap. Two caveats before treating it as free:

1. `f_max` is a cap only reached at infinite imbalance. To charge `μ` at a
   realistic ratio `r` you need `f_max ≥ μ / I(r)` — for OpenRouter that is
   ~182%/yr at r=3, ~243%/yr at r=2. Roughly 2–2.5× today's value, not 121×.
2. The transfer base changes from pool to open interest. On BTC that is
   **2.1× larger** per tick at the same rate, so `f_max` should come DOWN when
   the base changes, not stay put.

## Oracle cadence

BTC is already 5s in main. The four xStocks feeds are 15s. Measured inter-tick
gaps over five hours, 2026-08-18:

| Feed | Configured | Median | Mean | Max | Gaps >60s | Flat prints |
|---|---|---|---|---|---|---|
| btc-usd | 5s | 9.9s | 11.7s | 75s | 13 | 13 |
| spyx-usd | 15s | 15.2s | 27.4s | 165s | 51 | 11 |
| qqqx-usd | 15s | 22.6s | 38.6s | 165s | 95 | 11 |
| gldx-usd | 15s | 30.0s | 67.5s | **795s** | 91 | 42 |
| nvdax-usd | 15s | **59.8s** | 70.7s | 165s | 115 | 45 |

None of them meets its configured cadence, and flat-print counts are low enough
that these are genuine skipped ticks rather than deduplicated unchanged prices.
Moving to 5s before fixing that spends more request budget for no extra
freshness — and a stalled feed pauses its market, which is worse than a stale
mark.

Scalping edge scales with `√Δt`, so the gain from a faster tick is smaller than
it looks, and the taker fee is already doing the work:

| Tick | Edge/round trip | vs 10 bps fee |
|---|---|---|
| 15s | 1.50 bps | 6.7× cover |
| 10s (BTC actual) | 1.22 bps | 8.2× cover |
| 5s | 0.87 bps | 11.5× cover |

**Sequence to get to 5s:** batch Jupiter (done on this branch) → diagnose the
residual 15s shortfall → flip `updatePeriodMs`/`pollPeriodMs` and verify the
median gap actually lands near 5s. Separately, find out why BTC delivers 9.9s
on a 5s poll.

## Manifold DAU — three independent blockers

- **Weekday seasonality funding cannot touch.** Monday averages **+6.45%**
  (t = 5.92), Saturday −4.91% (t = −4.89), Tuesday −3.55% (t = −3.52). Maximum
  funding chargeable over one day at `f_max` and infinite imbalance is 0.547%.
  Monday alone is 11.8× the cap; break-even leverage is 0.085×. **Notional
  funding does not fix this** — under that model break-even is `f = μ` = 6.45%
  per day = 2,354%/yr, still 11.8× the cap.
- **σ = 25.4%/day** on the live `manifold-dau` feed, ten times BTC's.
- **The pipeline is broken.** `daily_stats` last wrote 2026-08-01 with 21 rows
  in 30 days. `manifold-dau` also writes to `oracle_prices` but is NOT in
  `ORACLE_FEEDS`, and its values (11.9k–56.3k) do not match `daily_stats.dau`
  (659–2,081) — they measure different things.

A 7-day trailing-average oracle removes the seasonality by construction. Fix
the pipeline and re-measure first.

## NVDA earnings gaps

Bad debt is `(gap − 1/L) × crowded OI`, per year, at 600k of crowded-side OI:

| Leverage | Liq buffer | 8% gap | 15% gap | 20% gap |
|---|---|---|---|---|
| 100× | 1.00% | 168,000 | 336,000 | 456,000 |
| 25× | 4.00% | 96,000 | 264,000 | 384,000 |
| 10× | 10.00% | 0 | 120,000 | 240,000 |
| 5× | 20.00% | 0 | 0 | 0 |

This is the one market where 100× has a directly calculable cost rather than
just more variance.

## Ranked by effect on how long the pool lasts

House signal-to-noise is `(turnover × fee) / (net-OI fraction × volatility)` —
a ratio with **no size term**. Adding liquidity scales winnings and risk
equally; it never changes the odds.

1. **Set `takerFeeBps` explicitly on every market.** All four live contracts
   have it `null`, falling through to the default of 10. It is the only
   systematic inflow the market has and it should be a stated number.
2. **Per-market leverage caps**, per the table above. This is the lever that
   moves net OI, the multiplier on every risk term.
3. **Charge funding on notional.** Collapses the drift constraint (above) and
   makes the positions creating an imbalance pay proportionally to correct it.
4. **Track house P&L explicitly.** Subsidy, accrued fees and retained
   liquidation margin are indistinguishable inside `poolLong`/`poolShort`.
5. **Liquidate at a maintenance margin above zero.** Positions currently
   liquidate at exactly zero equity, so the house absorbs gap risk with no
   compensation.

## Limitations

- SPY/QQQ/GOLD/NVDA σ and drift are assumptions; every cap moves with them.
- Drift measured over one window is not forward drift. OpenRouter's +121.6%
  cannot persist against a 100% ceiling — directions are more reliable than
  magnitudes.
- Oracle gap stats cover one five-hour window on feeds hours old. Re-measure
  over a full week including a weekend.
- House P&L assumes uninformed flow. Two bots already extracted ~M$70k in ~30h
  at ~1.5 bps per round trip.
- DAU seasonality comes from `daily_stats`, which is itself stale.
