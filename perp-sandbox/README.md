# perp-funding-sandbox

Local sandbox for modelling Manifold's perp funding mechanics.

Lives **outside** the repo (`c:\Projects\manifold-perp-sandbox`, next to
`c:\Projects\manifold`) so it is untracked by construction — no `.gitignore`
entry, no `.git/info/exclude` edit, nothing in the repo's working tree. It
imports from the repo read-only and never writes to it.

## The rule this tool is built around

Every formula comes from the repo. `src/common.ts` is the only file that
reaches into `common/src/perps/*`, and it re-exports; it computes nothing.
No other file in this sandbox contains a funding, liquidation, ADL, capacity
or solvency formula.

Both funding models are the *same* imported `computeFundingRate` — only the two
numbers handed to it differ (pool balances vs `getPerpOpenInterest`). There is
no second implementation that could drift.

`yarn typecheck` compiles the real `common/src/perps/*.ts` as part of the
program, so a signature change in the repo breaks this build.

## Running — web UI

```
yarn ui
```

Then open **http://localhost:5178**. Six tabs:

- **Playground** — every parameter as a form field, both models charted side by
  side: funding rate per period (with the zero line, because sign is the whole
  argument), long-side capacity used against its cap, and cumulative transfer.
  Switch the book to the synthetic leverage-asymmetry case, or set an oracle
  move to trigger liquidations and ADL.
- **Pathways** — price move × elapsed time, run from the live book, scored on
  the **buffer**: escrow minus everything owed to open positions at that price.
  That is the market's actual cushion, and it is what moves — pool *balances*
  barely change when nobody closes. Hover a cell for pools, open interest,
  funding moved, liquidations and ADL at that destination.
- **Market design** — the leverage cap implied by an asset's drift and its
  volatility, which bind independently and swap which one is tighter. Editable
  assumptions for BTC/SPY/QQQ/GOLD.
- **Real BTC paths** — realized volatility and sigma bands from the live
  `btc-usd` oracle feed (a year, 48,681 points), plus real 90-day windows
  mirrored onto today's book. BTC fell across the whole sample, so a direction
  control inverts the returns to test the upside at identical volatility.
- **Drift & subsidy** — whether funding can pay for an asset with a real
  expected return, which is the SPY/QQQ question. Break-even leverage, the
  imbalance ratio each leverage would need, where a one-sided book settles, and
  what a subsidy does to the open-interest cap and therefore to worst-case
  drift leakage.
- **Parameter sweep** — a k × f_max heatmap of the compounded %/day charge at an
  imbalance ratio you drag, plus the cost curve across ratios. Hover a cell for
  its 1.2× cost and its bite ratio.
- **Validation** — the 63-event replay against prod, with the recovered config
  history.
- **Text reports** — the full CLI output for all four scenarios, run with the
  Playground's current parameters.

**The browser never computes funding.** Every number is produced in Node by the
imported `common/src/perps/*` functions and sent to the page as JSON; the page
only draws it. `web/index.html` is re-read per request, so you can edit the UI
and just refresh — no restart, no build step. Set `PORT` to move it off 5178.

## Running — CLI

```
yarn validate        # do this first
yarn sim book
yarn sim 1           # live BTC, flat oracle, both models, 30 days
yarn sim 2           # k / f_max sweep
yarn sim 3           # leverage-asymmetry case
yarn sim 4           # −10% stress + move-depth sweep
yarn sim all
```

(There is no `yarn install` step and no `node_modules` here — the scripts call
the repo's `ts-node` and `typescript` directly.)

### Parameters

| flag | meaning | default |
|---|---|---|
| `--k` | `fundingSensitivity` | contract's (1) |
| `--fmax` | `maxFundingRate` per period | contract's (0.000228) |
| `--exponent` / `--p` | convexity: `I^p`; `p=1` is exactly the current model | 1 |
| `--periods` | periods simulated | 720 |
| `--period-hours` | hours per funding period | 1 |
| `--taker-fee-bps` | open-side taker fee | 10 |
| `--price` | oracle price | snapshot's |
| `--input` | `pool` or `oi`, for the `rate` command | both |
| `--flow-long` / `--flow-short` | new margin opened per period | 0 |
| `--flow-lev-long` / `--flow-lev-short` | leverage for that flow | 5 |
| `--sample` | row sampling in scenario 1 | one per day |

```
yarn sim 1 --k 5 --fmax 0.001
yarn sim 2 --exponent 2
yarn sim 4 --flow-long 500 --taker-fee-bps 25
```

## Validation

`yarn validate` replays all 63 stored BTC funding events from
`contract_perp_funding_events`, feeding each event's own recorded pre-transfer
pool balances into the imported `computeFundingRate`.

All 63 reproduce to float round-off. The event that stamped the contract's
current `fundingRate` reproduces with relative error **exactly 0**. That is the
proof that (a) this sandbox runs prod's math and (b) **prod's funding is
pool-derived today** — PR #3985 is not deployed.

24 of the 63 reproduce at *today's* config; the other 39 need
`f_max = 1/8760`, because the cap was raised live between the 08-07T17:00 and
08-07T18:00 events. That value is **recovered from the events, not read from
prod** — see `yarn sim diagnose`, which solves each event for the parameter
that produced it. Implied `f_max` is constant at 1.1415525e-4 across all 39
while implied `k` scatters from 2.01 to 3.23, so only `f_max` moved.

## Data

`data/btc-snapshot.json` — the live book (49 long / 43 short positions, pools,
oracle, config), pulled read-only via the `postgres-prod` MCP on 2026-08-09.
`data/btc-funding-events.json` — all 63 funding events, plus the recovered
parameter history.

Both are frozen snapshots. Re-pull them if you want current numbers; nothing
in the tool talks to a database.

## What this model cannot tell you

Stated plainly, because a confident wrong number is worse than a gap:

- **No behavioural response.** Positions never close, take profit, or arbitrage
  the funding they are being charged. In reality a rate that bites changes the
  book that produces it. Every multi-day projection is therefore an upper bound
  on how long an imbalance persists, not a forecast.
- **`--flow` is not a market.** It opens a fixed size on each side every period
  from a synthetic user. It respects the capacity gate (opens over the limit are
  refused, and counted) but it is not price-responsive.
- **Scenario 1 is a flat oracle.** No liquidations or ADL fire, so it isolates
  funding. That is the point, but it is not a forecast of the next 30 days.
- **Snapshot, not a feed.** The book is frozen at the pull time. It had already
  moved materially from the figures in the original brief (see below).
- **Single market.** BTC only. Nothing here says anything about the other three
  perp markets, whose leverage profiles differ.
- **Funding period vs oracle cadence is not modelled.** The sandbox charges
  funding every period unconditionally; prod additionally requires a fresh
  oracle value for periods longer than an hour (`shouldApplyFunding`). Only
  matters if you sweep `--period-hours` above 1.
- **Fees are the only pool inflow.** No subsidy, no liquidity injection, no
  resolution.
- **The margin-vs-notional distortion is surfaced, not fixed.** Funding is
  charged on margin throughout, exactly as prod does it.
- **Drift is an assumption you supply, not a measurement.** The Drift tab takes
  an annual expected return as input. Nothing here estimates what SPY's or
  BTC's drift actually is — the break-even leverage it reports is only as good
  as the number you type. The *structure* of the result (required funding
  scales with leverage, funding is a transfer and cannot offset drift in
  aggregate) holds for any drift you pick.
- **Buffer assumes simultaneous closing.** It values every open position at the
  same price at once. Real closes are sequential and move nothing — there is no
  price impact in this AMM — but they do change who is left to pay whom, which
  the buffer number does not capture.
- **Replay uses daily closes, so liquidation counts are a FLOOR.** A day that
  wicked 6% down and closed flat reads here as flat. Many live positions sit
  1–2% from their liquidation price, so real paths would trigger more than the
  replay shows. The hourly series exists in prod if this needs tightening.
- **The replay sample is one regime.** BTC fell from ~125k to ~65k across the
  whole year, so every un-inverted window is a down-move. The inverted ones are
  a symmetry test at matched volatility, not a forecast, and neither covers a
  regime this year did not contain.
- **Escrow is conserved in this model, so "buffer" is not the pool.** Nobody
  closes here, so total escrowed mana never moves — measured swing over a
  90-day replay is exactly 0. What moves is the *liability*: what the pool owes
  if everyone closed. Buffer = escrow − liability is therefore a mark-to-market
  claim on a fixed pot, not a cash balance. In production the pot genuinely
  drains when winners close, and this model does not show that.
- **Market-design assumptions are inputs, not measurements.** Only BTC's
  volatility comes from a live feed. SPY/QQQ/GOLD drift and vol are long-run
  judgement calls; the recommended caps move directly with them.
- **The equilibrium model is mine, not prod's.** Prod has no notion of trader
  EV. Only the funding rate `f(r)` comes from `common/`; the EV algebra around
  it assumes every long shares one leverage, every short another, everyone
  holds for the period, and traders act on expected value alone. It tells you
  which way the incentive points and roughly how hard — not what people will
  do.

### Snapshot drift from the brief

The brief quoted pools 59.8k/82.1k, OI 454k/256k, long capacity ~94%. At pull
time the book was pools **58.9k/109.6k**, OI **357.4k/287.3k**, long capacity
utilisation **73.2%**. A ~M$50k margin short at 1.49x opened in between, which
raised the short pool and with it the cover backing long capacity. The
qualitative conclusions below are unchanged; the specific percentages are not
the brief's.
