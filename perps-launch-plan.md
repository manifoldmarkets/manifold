# Perps launch plan — feeds, markets, and sequencing

Written 2026-07-02. Scope: get `origin/perps` (tip `5f8fcf137`) release-ready with 4 launch
markets on the **current parimutuel mechanism** (notion item 4 deferred — funding-as-carry is
the accepted answer for trending markets). All API endpoints below were verified live today.

> **STATUS 2026-07-03 — implemented on `perps-launch`** (branched off `origin/perps`,
> merged with main): all of Phase 0 (0.1 merge, 0.2 hygiene incl. amm tests, 0.3 registry +
> 15s tick + metrics fast path) and all feed adapters + daily jobs + backfill scripts for
> ECI / BTC / UK carbon. One deviation: the BTC median uses **Bitstamp instead of Binance**
> (Binance geo-blocks US IPs, where prod GCP egress lands). Typecheck (web/api/scheduler),
> lint, and the 171-test common suite are green.
> **Remaining:** run the dev verification checklist below (needs dev DB + backfills + admin
> market creation), then the prod rollout steps. GCP log-based alerts on `[oracle-feeds]` /
> `[update-perps]` log.error lines still need to be created in the GCP console.

**Launch set (day 1):**
1. Trump approval rating (exists) — daily, politics anchor
2. **Epoch Capabilities Index frontier** — daily/bursty, AI + grants angle
3. **BTC/USD** — 15-second cadence, the fast flagship, free feeds
4. **UK grid carbon intensity** — 30-min cadence, oscillating, climate angle

Week-2 follow-ons: Adjacent partisan index (pending their cadence/licensing answer), oil
(pending pay-or-Yahoo decision, see Market 3).

---

## Phase 0 — shared infra (do before any market)

### 0.1 Rebase `perps` onto `main` (~2.5 months stale)
- Known conflict: `@google/generative-ai` → `@google/genai` SDK migration in
  `backend/shared/src/helpers/gemini.ts` + backend package manifests.
- `backend/supabase/migrations/2026042201_add_perps.sql` — check no numbering collision with
  migrations added since April.
- `web/components/contract/{contract-page,contract-tabs,contract-overview}.tsx` churn on main;
  re-verify the PERP branches render after merge.

### 0.2 Hygiene fixes (small, all pre-launch)
1. **`PERPS_SKIP_ORACLE_FRESHNESS` → `false`** (`common/src/envs/constants.ts`). For local dev,
   create test markets with huge `maxOraclePriceAgeMs` instead of flipping the constant.
2. **`create-perp.ts`: honor `groupIds` + generate embeddings.** The schema accepts `groupIds`
   but the handler drops it, and it never calls `generateContractEmbeddings` (create-market.ts
   does). Without both, perps are invisible to topics/feed/search/elections page. Copy the
   patterns from `backend/api/src/create-market.ts` (embeddings non-fatal, `.catch()`).
3. **Price validation at ingestion + resolve.** `internal-write-oracle-price` schema accepts any
   number; `resolvePerp` settles at the latest feed row with NO validation (`runOracleUpdate`
   checks `<= 0`, resolve doesn't). Add: `price > 0` in the zod schema, per-feed sanity bounds in
   the feeds registry (0.3), and make `resolvePerp` run the same bounds check before settling.
4. **Funding double-run guard.** The `FUNDING_PERIOD_MS` gate lives in `update-perps.ts` OUTSIDE
   the advisory lock, and `runFunding` has no internal check. Harmless hourly, real at fast
   cadence. Move the last-funding-time read inside `runFunding`'s transaction (it already holds
   the lock) and no-op if `< FUNDING_PERIOD_MS` elapsed.
5. **Unit tests for `common/src/perps/amm.ts`** (pure, no DB — repo rule requires them):
   - funding conservation: `L + S` unchanged by `applyFunding`; haircut/bonus factors match pools
   - liquidation boundary: price exactly at `liquidationPrice`, ±ε either side
   - ADL: factor math when winning-side profit exceeds losing pool; only profitable positions scaled
   - open/close round-trip: payout accounting, pool deltas sum to zero vs user payouts
   - solvency gate: post-open `solvencyFactor >= 1` invariant
6. Leverage cap stays 100 per the "leave gigaleverage" decision. Suggest the admin create form
   *defaults* to 10 while allowing up to 100.

### 0.3 Oracle feeds registry + fast tick (supersedes notion items 2/3)

**Key discovery: no persistent worker service is needed.** The scheduler already runs a
10-second croner job (`sports-live`, `*/10 * * * * *` in `jobs/index.ts`) with `protect`
(overlapping runs are skipped). The notion doc's "sub-minute feeds cannot be a Croner cron job"
is disproven by existing precedent. Model the fast tick on `backend/scheduler/src/jobs/sports-live.ts`.

**New file `backend/shared/src/oracle-feeds.ts`** — a registry replacing per-feed one-off jobs:

```ts
export type OracleFeed = {
  id: string
  fetchLatest: () => Promise<{ ts: number; price: number } | null>
  cadence: 'fast' | 'daily' // fast = polled by the fast tick
  minPrice: number          // hard sanity bounds; out-of-range points are dropped + alerted
  maxPrice: number
  maxJumpFrac?: number      // reject points that jump > this fraction vs the last stored point
  staleAfterMs: number      // feed-health alert threshold (also validates market's maxOraclePriceAgeMs at create)
}
```

**New job `update-oracle-feeds`, `*/15 * * * * *` (every 15s):**
1. For each `fast` feed: `fetchLatest` → sanity/jump check → `upsertOraclePrices` → for each
   live perp on that feed, `runOracleUpdate(contractId, price, ts)`. Skip entirely if the price
   is unchanged from `contract.oraclePrice` (no-op ticks must not write).
2. Feed health: if latest stored point is older than `staleAfterMs`, `log.error` every tick
   (drive a GCP log-based alert off it — no Discord/Slack helper exists in the repo). This fixes
   the "dev oracle silently froze for 19 days" failure mode.
3. Wire the liquidation/ADL notification emission (currently only in `update-perps.ts`) into a
   shared helper so both the fast tick and the hourly job send them.

**`update-perps` (hourly) keeps:** oracle-apply for `daily` feeds + `runFunding` for all
contracts (gate now inside `runFunding` per 0.2.4). Funding cadence stays hourly — matches
Kalshi-ish norms and keeps event volume sane.

**REQUIRED engine change for fast cadence — metrics fast path.** `runOracleUpdate` currently
rebuilds `user_contract_metrics` for the union of ALL before/after position holders on every
call. At 15s ticks that's a full metrics rebuild for every holder, 240×/hour/contract. Change:
when `upserts` and `deletes` are both empty (no liquidations, no ADL), skip
`buildPerpUserContractMetricsQuery` entirely and only patch the contract's
`oraclePrice`/`oraclePriceTime`. Metrics only need rebuilding for users whose positions changed.

**Invariant to preserve (load-bearing, undocumented):** closes pay winners π out of the opposing
pool at the cached `contract.oraclePrice`, with no floor. This is only safe because liquidation +
ADL run atomically in the same transaction as every price change (`runOracleUpdate` does this
correctly). Never add a "cheap price refresh" path that bumps `oraclePrice` without ADL.

---

## Market 1 — Epoch Capabilities Index frontier (plan this first ✅)

**Oracle definition.** `feed_id: 'eci-frontier'`. Value = max ECI score across all models whose
release date ≤ day D (a running frontier). Currently **161** (Claude Fable 5); scale runs
~100–165, moves in steps of ~1–3 points when new frontier models get evaluated.

**Source (verified today).** `https://epoch.ai/data/benchmark_data.zip` — official Epoch download,
CC-BY, zip stamped 2026-07-02. Contains `epoch_capabilities_index.csv` (690 rows) with columns:
`Model version, ECI Score, Release date, Organization, Country, Model accessibility, ...`.
No standalone CSV URL (404) — must download the zip. Add a tiny zip dep (`fflate` recommended)
to `backend/shared`.

**Adapter.** `backend/shared/src/eci.ts` + `backend/scheduler/src/jobs/update-eci.ts`, modeled
exactly on `trump-approval.ts` / `update-trump-approval.ts`:
- fetch zip → extract CSV → parse → `frontier(today) = max(ECI Score where Release date ≤ today)`
- sanity bounds: 140–220 initially
- upsert ONE point for today; **never rewrite past days** (same immutability policy as Trump —
  if Epoch retroactively revises a model's score, history stays as-traded)
- cron daily `0 45 5 * * *` (after trump-approval at 5:30)
- Backfill script `backend/scripts/backfill-eci-oracle.ts`: compute the running frontier per day
  over the last ~18 months from release dates → seeds the chart.

**Market config.** Question: "Epoch Capabilities Index — frontier AI capability score".
`maxOraclePriceAgeMs`: 3 days. Subsidy: **skewed short** (e.g. 30k short / 10k long) — pools
will go long-heavy on a monotonic index, and the short pool is what pays winners.
`maxFundingRate`: small (≈0.001/hr ⇒ ~2.4%/day max) — tune in dev; funding IS the market here
(longs pay to hold), say so in the description. Attribution: CC-BY requires
"Data: Epoch AI Capabilities Index" with a link, in the market description.

**Risks.** Step jumps gap through liquidation prices — fine in this engine (losers forfeit at
most margin; no bad debt). Zip URL/schema drift — feed-health alert catches it. Manipulation:
effectively none. Consider emailing Epoch — a live market on their index is good for both sides
and for the grant story.

---

## Market 2 — BTC/USD (fast flagship)

**Oracle definition.** `feed_id: 'btc-usd'`. Median of three free, no-auth endpoints (all
verified live today, quotes within 0.12% of each other):

| Source | Endpoint | Today |
|---|---|---|
| Coinbase | `GET https://api.coinbase.com/v2/prices/BTC-USD/spot` | 61,052 |
| Kraken | `GET https://api.kraken.com/0/public/Ticker?pair=XBTUSD` (`.result.XXBTZUSD.c[0]`) | 61,056 |
| Binance | `GET https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT` | 61,123 |

Median-of-3; require ≥2 successful sources else skip the tick (never write a single-source
point). Binance is USDT-quoted (~0.1% basis) — harmless inside a median. Rate limits are a
non-issue at 4 req/min/source.

**Adapter.** Entry in the feeds registry, `cadence: 'fast'`. Bounds: min 1,000 / max 10,000,000,
`maxJumpFrac: 0.10` per tick. `staleAfterMs`: 2 min.

**Market config.** Question: "Bitcoin price (USD)". `maxOraclePriceAgeMs`: 2 min. Subsidy: fat
and symmetric (e.g. 25k/25k). This is the market that exercises the entire fast pipeline —
it goes second so ECI (zero new infra) is banked first, but it's the launch centerpiece.

**Mechanism note.** Unbounded + trending = the funding-carry regime you've accepted: persistent
long skew ⇒ longs continuously pay shorts ⇒ shorts are compensated for being structurally wrong.
Watch ADL frequency in dev; if winners get haircut often, raise subsidies, not the mechanism.

---

## Market 3 — Oil (WTI): recommend DEFER to week 2

No good free real-time feed exists; BTC fills the "very liquid + fast" slot for free on day 1.
Options when you pick it up:
- **Yahoo Finance (unofficial, free)** — verified working today:
  `GET https://query1.finance.yahoo.com/v8/finance/chart/CL=F?interval=1m&range=1h` with a
  browser `User-Agent` header → `chart.result[0].meta.regularMarketPrice` ($67.57, NYMEX,
  minute granularity). ToS-gray, can break or rate-limit without notice. Fine for dev, risky
  to hang a flagship on.
- **Paid proper**: oilpriceapi.com or commodities-api, ~$20–55/mo tiers.
- **Free official**: FRED/EIA daily WTI — lags a day; no better than Trump-approval cadence.

Extra design cost regardless of source: NYMEX closes nightly ~1h + weekends. The freshness gate
will (correctly) freeze open/close during those windows — needs UI messaging ("trading paused,
market closed"), and Monday reopens gap through weekend news. All of this works on the same
fast-tick infra with zero new engine code, so deferring costs nothing structurally.

---

## Market 4 — UK grid carbon intensity (the green one)

**Oracle definition.** `feed_id: 'uk-grid-carbon'`. Value = latest **actual** carbon intensity
of the GB electricity grid in gCO₂/kWh.

**Source (verified today).** `GET https://api.carbonintensity.org.uk/intensity` — official
National Energy System Operator API. Free, no auth, no key. 30-minute settlement blocks with
BOTH `forecast` and `actual` per block (today: forecast 44, actual 51, index "low"). The current
block's `actual` can be null until finalized — adapter walks back to the latest non-null actual
(`/intensity/{from}/{to}` supports ranges).

**Why this one.** It oscillates hard (roughly 30–300 gCO₂/kWh with wind/solar/demand swings) =
genuinely two-sided flow, the parimutuel engine's best case. The published forecast gives
traders something to fade — skill expression, not coin-flipping. Climate/grants angle. Nobody
else runs this market.

**Adapter.** Feeds-registry entry, `cadence: 'fast'` but internally no-ops unless a new
settlement block appeared (effectively one point per 30 min). Bounds: 0–600 hard.
`staleAfterMs`: 3h (their actuals occasionally lag). `maxOraclePriceAgeMs`: 3h.

**Market config.** Question: "UK grid carbon intensity (gCO₂/kWh)". Subsidy modest + symmetric
(10k/10k) — mean-reverting, low ADL risk. Description should link the NESO API and explain the
30-min cadence.

Backlog flavors for later: regional (London) intensity; NWS temperature
(`api.weather.gov`, public-domain, ~hourly) if a US-weather market is ever wanted.

---

## Day plan → "release ready tomorrow"

Order matters — each step is independently commit-able:

1. **Rebase onto main** + compile green (gemini SDK is the known conflict). Biggest unknown, do first.
2. **Hygiene commits** (0.2: flag flip, groupIds+embeddings, price validation, funding guard) +
   **amm.ts test suite**.
3. **Feeds registry + fast tick job + metrics fast path** (0.3). Then adapters: ECI (+ backfill
   script), BTC, UK carbon.
4. **Dev verification checklist:**
   - [ ] backfills run; charts render for all feeds
   - [ ] create all 4 markets via `/admin/create-perp` with the configs above, tagged to topics
     (proves the groupIds fix), verify they appear in topic browse + search (proves embeddings)
   - [ ] trade long, add, flip, close on each — balances and event log correct
   - [ ] forced liquidation: open 50× position, write an adverse price via
     `internal-write-oracle-price`, next tick liquidates + notification fires
   - [ ] stale-feed drill: disable one feed's fetch → opens/closes blocked with the clear error,
     `log.error` fires every tick
   - [ ] funding: exactly one funding event per contract per hour while the 15s tick runs
     (proves the double-run guard)
   - [ ] resolve a dev market: payouts + residual to creator; unresolve blocked
   - [ ] soak: 3 fast contracts on 15s ticks for ~1h; watch scheduler CPU + advisory-lock
     contention + contracts-table write volume
5. **Prod rollout:** run the migration → deploy → create the 4 markets **unlisted** → self-trade
   sanity pass on prod → flip to public + announce. (Cleaner than flag juggling —
   `PERPS_ENABLED` is a hardcoded `true` on the branch; unlisted-first is the soft launch.)

## Open items (not blocking day 1)
- Adjacent.markets: confirm index update cadence + API pricing/licensing → week-2 elections-page perp.
- Oil: pay vs Yahoo decision.
- Per-second BTC (websocket ingestion) — only if 15s feels slow in practice; would be the first
  thing to justify an actual persistent worker.
- Perp trades carry zero fees — decide deliberately post-launch.
- Volume counted as notional (mana × leverage) inflates perp volume vs CPMM in shared stats surfaces.
