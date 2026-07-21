# Perps launch — review handoff (2026-07-04)

Branch: **`perps-launch`** (pushed). Everything below sits on top of Stephen's original
`perps` branch (`5f8fcf137`, April 2026). Reviewer: this doc is self-contained; the two
companion docs are `perps-launch-plan.md` (repo root, original implementation plan) and
`backend/shared/src/perps/README.md` (architecture).

## TL;DR for the reviewer

- 11 perps commits on top of Stephen's branch: 3 from the rebase/infra pass
  (`e3d45c3b5`, `ce2e36e83`, `0e1263558`), 8 from today's live QA session (see table).
- Today's QA on dev found and fixed **three launch-blocking bugs that all shipped
  "green"** (build + typecheck + 171 unit tests passing): a transaction-rollback bug
  that froze every fast-feed market, a market page with no update mechanism at all, and
  a profile endpoint that stripped every perp field. The unit tests cover the pure math
  only — **nothing catches integration bugs**. That is the meta-finding: please review
  the engine's DB-composition paths line-by-line, not just the AMM math.
- Three of four launch markets exist on dev and are live-ticking. Funding has **never
  run** for them (see Untested). Two engineered liquidation/ADL scenarios are armed on
  the dev BTC market and will fire on their own with price movement.
- Known design tension (deliberate, needs a team decision, not a silent fix): the
  solvency gate admits unlimited notional at open; ADL is the only backstop. A live
  Ṁ28M short vs a ~Ṁ28k long pool on dev demonstrates it.

## 1. What this branch is

| Layer | Commits | Summary |
|---|---|---|
| Stephen's perps | (`origin/perps`, ~5.5k lines) | Parimutuel dual-pool perp AMM: pure math in `common/src/perps/amm.ts`, engine in `backend/shared/src/perps/engine.ts`, 4 DB tables, API endpoints, market page UI. Winners paid from the loser pool; ADL haircuts winners when it can't cover; hourly funding from crowded side to thin side. |
| Merge + hygiene | `86b88590a`, `e3d45c3b5` | Merged main (gemini SDK migration etc.). Freshness flag flipped ON (`PERPS_SKIP_ORACLE_FRESHNESS=false`), input validation, funding double-run guard moved under the advisory lock, metrics fast path for sub-minute ticks, **19 AMM unit tests** (first tests for the money math). |
| Oracle infra | `ce2e36e83` | Feed registry (`backend/shared/src/oracle-feeds.ts`) with bounds/jump-guard/staleness per feed; 15s scheduler job `update-oracle-feeds` (croner handles sub-minute; no separate worker needed); 3 launch feeds: `btc-usd` (median Coinbase/Kraken/Bitstamp), `uk-grid-carbon` (NESO 30-min actuals), `eci-frontier` (Epoch zip, daily); backfill scripts; `create-perp` now honors `groupIds` + generates embeddings + validates `maxOraclePriceAgeMs` ≥ feed staleness. |
| Today's QA session | 8 commits below | Live testing against dev with a human trading through the UI. Bug fixes + UX to a "high-frequency instrument" standard. |

## 2. Today's commits (reasoning included)

| Commit | What | Why |
|---|---|---|
| `38164675f` | Bet panel: collapsible profit-scenario ladder (+25/50/100% → price needed → mana profit), funding cost in Ṁ/hr, log-scale leverage slider | Traders should quick-math "if it hits X in N hours I make Y minus funding" in their head. Funding shown on **margin, not notional** — matches `applyFunding` (see risk #4). Linear slider bunched 1×/5×/10× marks unreadably on 375px phones; leverage is perceived logarithmically. |
| `cb3bef07b` | Admin create-perp form: per-side subsidy, topic selector, live feed-health preview, "create unlisted" | The form is the system of record for market creation and couldn't express the launch configs (ECI needs a 30k/10k short-skewed subsidy; topics were API-only). Feed-health preview kills the #1 admin footgun (creating against a stale/mistyped feed). |
| `e3b6146a8` | Form funding cap 100 → 8000 %/yr, show %/day | Launch config (0.001/hr ≈ 876%/yr ≈ 2.4%/day) literally couldn't be typed into the form. |
| `e3bdef784` | **Engine fix: fast path used `.none()` on a `returning *` query** | pg-promise throws `QueryResultError(notEmpty)` when rows come back → **whole tick transaction rolled back** → every fast-feed perp froze at its creation price. Found live on dev: `oracle_prices` 15s-fresh while the contract never moved. One char fix (`.one()`), but see review focus #1. |
| `e518e6cc8` | Market page: 15s poll of oracle price | The page had **no update mechanism** — no websocket topic, no poll. The engine runs in the scheduler process, so it can't reach the API's websocket server; polling is the pragmatic fix. |
| `7353bf572` | Funding chart axis fix (read ±876,000%); green/red tick flash on price | Flat funding series was padded ±1 in raw per-hour units → annualized to ±876,000% on the y-axis. Flash = exchange-style "the number is live" cue. |
| `fb10cf796` | Whole page live: `LiteMarket` carries perp fields; `market/:id` polled every 15s; **instant refresh after any trade/close** | Trading updated only the bet panel's local state; the position panel didn't learn about a new position until full page reload → user double-opened a short without seeing the first ("tricks users"). Now: one shared live overlay (price/pools/funding) + refresh() propagated to both panels on any action. |
| `b55d5d141` | Profile trades tab: real prices instead of "0.0000"; perp-native row expansion | `get-user-contract-metrics-with-contracts` `pick()`s a field allowlist that had no perp fields → label formatted `undefined` as "0.0000". Expansion now shows positions (notional/margin/entry/liq/live PnL) + last 10 engine events instead of an empty CPMM bets table. |

Also: `backend/scripts/run-oracle-tick-loop.ts` — local stand-in for the deployed 15s
scheduler job. Required for any dev testing while the deployed dev scheduler runs main
(no perps jobs).

## 3. Current dev environment state (as of handoff)

- **Markets live on dev** (created via the admin UI by the shared `Dev Manifold Markets`
  account): `bitcoin-usd-perpetual` (25k/25k subsidy, maxAge 5min),
  `epoch-ai-capabilities-index-frontie` (10k long/30k short, CC-BY credit in
  description), `uk-grid-carbon-intensity-gco2kwh-pe` (10k/10k). All 100× max leverage,
  876%/yr funding cap, k=10. All have embeddings; **UK carbon is missing its topic tag**
  (Science didn't attach — re-add via market page or API).
- **Not created**: the new Trump market. The April `trump-approval-rating` perp still
  exists with old params (k=1, 30h maxAge, live history incl. a 38× long). **Open
  decision**: keep it (has history) vs resolve + recreate with launch params.
- **Feeds**: all 4 backfilled and healthy. `btc-usd` ticking ~15s (347 rows in the last
  hour), `uk-grid-carbon` on 30-min blocks, `trump-approval-rating` + `eci-frontier`
  daily (refreshed through 2026-07-03; ECI frontier = 161.01, Claude Fable 5).
- **Processes** (all local to Tod's machine — dev has NO deployed perps scheduler):
  API on :8088, web on :3000, 15s tick loop (`run-oracle-tick-loop.ts`). **When these
  stop, markets freeze on their maxAge timers** (BTC after 5 min) — freeze means chart
  stops and opens AND closes are blocked. This is the freshness gate by design, not a bug.
- **Armed live scenarios on the BTC market** (left intentionally, will fire on price
  movement — audit the event rows + notifications when they do):
  1. `Dev Manifold Markets` holds a **100× short, Ṁ28M notional, entry 61,988.81,
     liquidation at 62,608.70** (+1%). BTC printed 62,221 during the session.
  2. Any tick below ~61,988 makes that short profitable beyond what the ~Ṁ28k long pool
     can pay → **ADL should haircut it** (adl event + notification, factors < 1).
  3. `Devzy` holds a small 100× long (liquidates ~1% down).

## 4. Highest-risk review areas (ranked)

1. **Engine DB composition** (`backend/shared/src/perps/engine.ts`). The `.none()` bug
   pattern may not be unique. Every `pgTrans.multi(...)` / `.none()` / `.one()` against
   queries built in `queries.ts` (several end in `returning *`) deserves a look — a
   result-shape mismatch **rolls back the whole transaction**, and the scheduler
   swallows it into a log line. Nothing else fails loudly.
2. **Solvency gate admits unlimited notional** (`solvencyFactor` in
   `common/src/perps/amm.ts` + the deliberate "no notional cap" comment in
   `openOrAddPosition`). It only counts *existing* unrealized profit (≈0 for any fresh
   position), so the Ṁ28M-vs-Ṁ28k position on dev sailed through. Fat subsidies were the
   planned mitigation; they demonstrably cannot mitigate gigaleverage × giga-margin.
   **Proposed team decision: cap open notional at N× the opposing pool** (even N=10
   kills the pathological case without touching normal flow). Deliberate design per the
   original plan — do not silently change it, but do pressure-test it.
3. **No integration tests.** The 19 AMM tests are pure-math only. The three bugs today
   were all in integration paths. A jest suite that runs the engine against a real
   (or test-container) Postgres — open→tick→liquidate→resolve — would have caught all
   three. Biggest missing safety net for future changes.
4. **Funding is charged on margin (costBasis), not notional.** `applyFunding` scales
   `costBasis` by (1−f). Standard perp convention (incl. Kalshi) is funding on
   notional/position value; on ours, a 100× and a 1× position with equal margin pay the
   same funding despite 100× the exposure — so funding is nearly free for exactly the
   positions that stress the pools most (compounds risk #2). An old UI comment claimed
   "fraction of notional" (wrong, code wins; UI now shows the true Ṁ/hr). **Decide:
   convention (notional) vs current (margin)** — changing it alters the economics.
5. **Freshness gate blocks closes too** (`closePosition` in engine). Anti-cherry-picking
   by design, but a feed outage locks leveraged holders in while the real price moves.
   Needs a product decision (hard block vs close-only-with-warning) + the §alerts below.
6. **Field-stripping pattern.** The profile bug came from a `pick()` allowlist. Grep for
   other endpoints/components that slim contracts (`pick(`, custom column lists) and
   check they either include perp fields or degrade gracefully. `ContractStatusLabel`
   now dashes on missing price — other surfaces (feed cards, search rows, embeds,
   `feed-perp-price-sparkline`) haven't been audited for perps at all.
7. **Poll-based liveness.** Page polls `market/:id` every 15s per open viewer. Fine at
   QA scale; at launch scale it's N viewers × 4/min hitting an uncached endpoint —
   check the cache strategy on `market/:id`, and see the tick-rate plan below (the
   endgame is websockets, which also fixes this).
8. **Hot contract row.** Every BTC price change writes `contracts.data` (~4/min); the
   row has FTS generated columns + triggers. One market is nothing; 50 fast markets
   might not be. Soak numbers so far: 347 oracle rows/hr, no lock contention observed,
   tick errors zero after the `.one()` fix.
9. **CC-BY compliance** on the ECI market description (must credit Epoch AI with link —
   done on dev; keep for prod). **G9**: perp volume counts notional (margin × leverage),
   inflating volume stats vs CPMM — known/accepted; leagues/site-profit exclude perps.

## 5. Untested — needs testing before prod (priority order)

1. **Funding on the new markets — never ran.** The local loop only runs the 15s
   oracle tick; the hourly `update-perps` job has not run in this session (0 rows in
   `contract_perp_funding_events` for all 3 new markets). Must verify: funding fires
   hourly, exactly once (double-run guard under the advisory lock), correct direction
   (long-heavy BTC pool → longs pay), and per-user `funding` events land.
2. **Forced liquidation + notification.** Plan is ready: seed a scratch feed
   (`test-liquidation`), create a throwaway market via the admin form, open a 50× long,
   write one adverse price via `internal-write-oracle-price` (admin), verify the next
   tick liquidates, `perp_liquidation` notification arrives, margin stays in pool.
   (Deliberately NOT run against real feeds — `oracle_prices` is append-only by policy.)
   The two armed BTC scenarios (§3) may cover liquidation + ADL organically first.
3. **ADL notification content** — `applyADL` scaling verified in unit tests, but the
   end-to-end notification (only *scaled* users notified, correct factor) is untested.
4. **Resolve + unresolve-block** — `resolvePerp` settles everyone at oracle price,
   residual → creator, unresolve must 400. Test on the scratch market, then decide the
   April Trump market's fate with the same flow.
5. **Stale-feed drill** — stop the tick loop 6+ min: BTC opens AND closes must 400 with
   the stale-feed error; `[oracle-feeds]`/`[update-perps]` log.error lines fire. Also
   verify the market page communicates the freeze (it currently doesn't — UX gap).
6. **Multi-user concurrency** — two accounts trading the same market simultaneously
   (advisory lock serializes; nothing observed, but untested under real concurrency).
7. **Flip path via UI** — engine flip (auto-close opposite side) is unit-tested;
   clicking through it in the UI while the page live-polls is not.
8. **GCP log-based alerts** (still to create): scheduler ERROR on `[oracle-feeds]` and
   `[update-perps]`. This is the guard against the known failure mode — dev's oracle
   silently froze for 19 days in June when a redeploy displaced the perps scheduler.
9. **Mobile pass** on the new bet-panel/scenario UI (built to fit 375px; not re-checked
   since the live-page changes).
10. **Prod rollout** (§6) — nothing prod-related has been touched.

## 6. Prod rollout protocol (agreed, not started)

1. Merge to main is the ship mechanism — **never branch-deploy to prod** (a later main
   deploy would silently displace the perps scheduler jobs: exactly the June dev
   incident).
2. Run the perps migration on prod; backfill all feeds; verify tick + funding cadence.
3. Create markets **unlisted** from the official @ManifoldMarkets account (creator
   identity is public; creator economics — residuals, bonuses — should accrue to the
   house, not a personal admin).
4. Self-trade a sanity pass on each; flip public; tag topics; announce.

## 7. Soft plan: raising the Bitcoin tick rate (the "initial test set" candidate)

Current: 15s REST polling (median of 3 exchange REST APIs), engine tick 15s, page poll
15s. Product feedback from QA: on a play-money platform, *perceived* liveness is the
feature; cosmetics matter as much as reliability.

Decided direction (not yet built):
- **Do NOT tighten REST polling below ~15s** — Kraken public REST allows ~1 req/s and
  we'd trade reliability (rate-limit bans = frozen market = worst cosmetics) for little.
- **Step 1 (cheap cosmetic)**: animate price transitions client-side (~1s count-up when
  a real tick lands). No fabricated prices — displayed price must remain the fill price.
- **Step 2 (the real upgrade)**: exchange **websocket feeds** (Coinbase/Kraken push
  sub-second, free, no polling limits) → this is the first genuine justification for a
  persistent ingestion worker (croner is fine at 15s; websockets need a long-lived
  process). Write ticks at 1–5s granularity, engine tick to match on that feed.
- **Step 3 (pairs with 2)**: server push to browsers (websocket topic or SSE) instead
  of per-viewer polling; requires bridging engine-process events to the API's socket
  server (Redis pub/sub now exists on main for cross-instance websocket messages —
  reuse that).
- Funding stays hourly regardless (Kalshi uses 8h windows; cadence of funding ≠ cadence
  of price).

## 8. How to run this locally (gotchas that cost us time)

```
git fetch && git checkout perps-launch
yarn install
yarn build:ci          # REQUIRED before typecheck (TS6305 otherwise)
yarn typecheck && yarn --cwd common test
# env safety: firebase-tools' activeProjects is keyed by cwd STRING - on Windows a
#   drive-letter-case mismatch can silently resolve PROD. Verify before launching:
firebase use dev       # then check Node resolves DEV (see memory/gotchas)
# API:       cd backend/api && PORT=8088 NEXT_PUBLIC_FIREBASE_ENV=DEV node lib/serve.js
# Web:       NEXT_PUBLIC_API_URL=localhost:8088 NEXT_PUBLIC_FIREBASE_ENV=DEV yarn --cwd web serve
# Fast tick: cd backend/scripts && npx ts-node run-oracle-tick-loop.ts
# Hourly funding is NOT covered by the tick loop - run update-perps manually to test.
```
Windows: eslint enforces CRLF on disk; husky pre-commit lints whole staged files, so
pre-existing jsx-a11y errors in touched files must be fixed (we fixed several); use
`git commit -F <file>` for multi-line messages.

## 9. Addendum — 2026-07-21 session (funding verified; chart overlays; main merged)

### Funding — VERIFIED on dev (§5 item 1 is done)

Ran `update-perps` manually twice (new script `backend/scripts/run-update-perps-once.ts`,
after freshening feeds via the tick loop + new `refresh-daily-oracles-once.ts`):

- **Exactly one funding event per live market** with a fresh feed (BTC, UK carbon, ECI,
  Trump). Second run immediately after: **zero new events** — the double-run guard holds.
- **Direction correct everywhere.** Short-heavy pools (BTC 23.6k/305k → rate −0.000544;
  UK; ECI) transferred pool mana short→long and scaled short positions down / longs up.
  Long-heavy Trump (+0.0000283) had its two longs pay. Note the handoff's earlier
  "long-heavy BTC → longs pay" is stale — the Ṁ28M short's forfeited margin flipped BTC
  short-heavy.
- Per-user `funding` events landed with per-position deltas matching `applyFunding`.
- `manifold-daus` (feed stale 41 days) was skipped with the `[update-perps] ... is stale`
  log.error — the alert path works.
- **New finding:** the 15s tick and `update-perps` collide under SERIALIZABLE — several
  SSI 40001 aborts ("canceled on identification as a pivot") during the run.
  `runTransactionWithRetries` absorbed them and the DB shows exactly-once effects, but
  each abort dumps a huge `pgPromise background error` object (full pg client state)
  into the logs. Worth a log-hygiene fix before prod, and the GCP alert (§5 item 8)
  should not page on 40001 noise.

### Armed BTC scenarios (§3) — both fired organically

- The Ṁ28M 100× short **liquidated 2026-07-03 20:35 UTC** at 62,613.1 (liq level
  62,608.70). Margin Ṁ280k forfeited to the short pool — that's why `poolShort` ≈ 305k.
- Devzy's 100× long liquidated 2026-07-06 at 61,332. ADL never fired (no profitable
  winners against a drained side at the time). **Notification delivery for both is still
  unverified** — check the notification rows/UI for those two events (§5 items 2–3 remain).

### Suspicious: closes at a 4.6-day-stale price (freshness gate?)

On 2026-07-21 00:50–00:55 UTC, six BTC positions were closed at exactly 64,480.715 —
the July-16 cached price (feed had been dead 4.6 days; BTC maxAge is 5 min). The
freshness gate should 400 closes on a stale feed. Most likely the deployed dev API
predates the `PERPS_SKIP_ORACLE_FRESHNESS=false` flip (or a local API ran with the
skip flag). Either way: **redeploy the dev API from this branch** before further QA —
it also needs the perp txn-category commits.

### Branch + chart work

- **Merged `origin/main`** (13 commits, clean, no conflicts) so a dev deploy of either
  container carries main's KYC dedupe fix, Gemini migration, and sell-shares guard.
- **Chart overlay family** shipped in `web/components/perps/perp-chart.tsx`: dashed
  carry-neutral (funding break-even) line, ±1σ realized-vol cone, crowd liquidation
  bands, and your-position lines (entry / liq / personal break-even), behind persistent
  legend toggles. Projection math is pure and unit-tested in
  `common/src/perps/chart-projections.ts` (15 tests, incl. invariants that the personal
  break-even path reproduces `applyFunding` exactly). Not yet browser-QA'd.

### Later 2026-07-21: scheduler deployed; chart iteration QA'd live

- Tod deployed the dev scheduler — perps jobs now run autonomously (15s ticks
  confirmed; local loop retired). Second funding cycle observed on schedule.
- BTC feed's 4.6-day hole backfilled (90d of hourly Coinbase closes) after the
  chart rendered it as one giant bridge line. Chart hardened so outages can't
  do that again: line breaks across gaps, vol excludes outage returns, live
  ticks append client-side, x/y axes labeled, timeframe selector (client-side
  v1 — server `since` + bucketing needs the API redeploy), responsive width.
- Full logged-in trade lifecycle QA'd in-browser: open → You-chip + entry/BE
  lines appear (liq far below correctly clipped, domain not crushed) → close →
  tombstone + overlays clear. Balance deltas exact.

### Scheduler deploy to dev — prepared, not executed

`backend/scheduler/deploy-scheduler-windows.sh dev` is the path (build → local Docker
image → Artifact Registry → `update-container` on the `scheduler` VM in
`dev-mantic-markets`). Docker + gcloud auth verified working on this box. Not run in
this session (needs interactive approval). Once deployed, dev runs perps jobs
autonomously — remember the standing caveat: any later main-branch scheduler deploy
silently displaces the perps jobs again (June's 19-day freeze).

## 10. Key files

| Area | Files |
|---|---|
| Pure math + tests | `common/src/perps/amm.ts`, `amm.test.ts`, `pnl.ts`, `position.ts` |
| Engine (review focus) | `backend/shared/src/perps/engine.ts`, `queries.ts`, `user-contract-metrics.ts` |
| Oracle infra | `backend/shared/src/oracle-feeds.ts`, `oracle.ts`, `btc-price.ts`, `uk-grid-carbon.ts`, `eci.ts`, `trump-approval.ts` |
| Scheduler | `backend/scheduler/src/jobs/update-oracle-feeds.ts` (15s), `update-perps.ts` (hourly), daily feed jobs |
| API | `backend/api/src/create-perp.ts`, `place-perp-trade.ts`, `close-perp-position.ts`, `get-perp-*.ts`, `get-user-contract-metrics-with-contracts.ts` |
| Web | `web/components/perps/*` (overview/chart/bet-panel/position-panel), `web/pages/admin/create-perp.tsx`, `web/components/bet/user-bets-table.tsx`, `web/components/contract/contracts-table.tsx` |
| Local ops | `backend/scripts/run-oracle-tick-loop.ts`, `backfill-*-oracle.ts` |
