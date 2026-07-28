# PERP launch — senior engineering review handoff

Updated: 2026-07-28
Branch: `perps-launch`
Implementation snapshot: `55f6b8873`
Review base: `61b3394e2` (`origin/main` at the branch merge base)

This replaces the old rolling handoff journal. It is meant to orient a senior
engineer reviewing the final branch, not to preserve every step taken during
development.

## Start here

Review the implementation with:

```sh
git diff 61b3394e2...55f6b8873
```

Do **not** use `origin/perps` as the base. That is the April prototype ancestor
and would hide the original PERP implementation from the review.

The range is large: 171 commits, 236 files, approximately 30,116 additions and
648 deletions. About 7,100 added lines are operational scripts and another
1,600 are root documentation. There are also merges, reverted UI experiments,
and historical one-shot fixes. Review the final diff by subsystem rather than
reading every commit in order.

The other useful documents have narrower jobs:

- `backend/shared/src/perps/README.md`: current architecture and engine
  behavior.
- `perps-launch-audit.md`: detailed integration findings and DEV evidence.
- `perps-launch-runbook.md`: operational source of truth for PROD rollout and
  rollback.
- `perps-launch-plan.md`: historical planning context only; it is not current
  launch state.

## Bottom line

The branch is a credible release candidate, but it is not a small UI feature.
It introduces a new financial mechanism, oracle infrastructure, four database
tables, seven migrations, schedulers, accounting paths, discovery behavior,
and a dedicated web trading interface.

DEV is in a clean launch state:

- all seven effective migrations are installed (the April base migration plus
  six July follow-ups);
- exactly four clean launch markets exist unlisted with zero positions;
- BTC, UK grid carbon, Trump approval, and OpenRouter open-weight share are the
  intended launch feeds;
- ECI is deliberately excluded because its running frontier only rises and is
  bad two-sided market design;
- feed and unlisted preflights pass with zero failures;
- the destructive DEV drill passed 148/148 checks and cleaned up after itself;
- legacy/prototype markets were retired; and
- the deployed DEV web, API, and scheduler have been exercised in a signed-in
  browser.

No PROD launch work should be inferred from that. Human code review, PROD
migrations and deploys, hidden-market smoke testing, the exact announcement
preview, and staged publication are still required.

I would not ask the reviewer to rubber-stamp everything. The financial core is
the obvious risk, but there are also several explicit product/operations
decisions and a batch of already-used DEV scripts that can be removed or split
out before merge.

## System shape

```text
External oracle providers
        |
        v
feed adapters + validation registry
        |
        v
scheduler -> immutable oracle_prices -> liquidation / ADL / funding
                                             |
User -> API -> SERIALIZABLE engine transaction|
              |                               |
              +-> balances / pools / positions / append-only events
                                      |
                                      +-> current + period metrics
                                      +-> web, embeds, feeds, profile, portfolio
```

The important package boundary remains intact: pure shared types and financial
math live in `common/`; database behavior lives in `backend/shared/`; API and
scheduler consume shared code independently; web and native consume common
types and API schemas, not backend implementation.

## What changed, by risk

| Area                      | Main files                                                                  | Reviewer focus                                                                                 |
| ------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Financial math            | `common/src/perps/amm.ts`, `funding.ts`, `pnl.ts`, `escrow.ts` and tests    | Entry/exit math, funding, liquidation, ADL, exposure capacity, finite-number handling          |
| Transaction engine        | `backend/shared/src/perps/engine.ts`, `queries.ts`, `escrow.ts`             | Locking, retries, atomic flips, authorization, balance/pool invariant, idempotency, settlement |
| Database                  | `backend/supabase/migrations/*perp*`, generated schema                      | Immutability, indexes, public read policy, correction procedure, migration order               |
| Oracle/scheduler          | `backend/shared/src/oracle-feeds.ts`, feed adapters, scheduler jobs         | Source quality, cadence, staleness, ordering, fail-closed behavior, alerting                   |
| Accounting                | PERP metric files plus generic metric jobs                                  | Current/lifetime vs day/week/month P&L, funding inclusion, race safety, league exclusion       |
| Existing-site integration | discovery, search, related markets, stats, notifications, loans, resolution | Regressions to non-PERP markets and assumptions around `close_time = null`                     |
| Product/UI                | `web/components/perps/`, market cards, embeds, editor, profile, TV/OG       | Correct semantics, stale/error states, polling load, mobile/dark mode                          |
| Operations                | launch manifest, preflight, backfills, deploy scripts                       | Permanent policy vs launch-only policy, environment safety, rollback usability                 |

## Economic and lifecycle rules that need explicit approval

These are deliberate design choices, not implementation trivia:

1. **Funding is charged on margin/pool value, not notional.** The crowded pool
   transfers value to the thin pool and crowded positions have size and cost
   basis scaled proportionally. High leverage therefore pays less funding
   relative to notional than on a conventional exchange. The UI consistently
   describes this as a percentage of margin.
2. **Open interest is capped at 10× unreserved opposing-pool cover.** This is a
   hard-coded launch solvency guard. It blocks exposure increases when capacity
   is exhausted but never blocks an ordinary reduction or close.
3. **Oracle staleness blocks both opens and closes.** This prevents selective
   settlement against a stale quote, but users cannot exit during a feed
   outage.
4. **Trades do not move the quoted price.** They settle against a cached public
   oracle with no trading fee or spread. Latency pickoff is an acknowledged
   launch risk, not a solved problem.
5. **ADL can haircut winning exposure.** Liquidation losses first consume
   available backing; automatic deleveraging is the final solvency mechanism.
6. **Resolution settles all remaining positions and returns residual pools to
   the creator.** Launch feeds are therefore restricted to the official
   Manifold creator account.
7. **V1 has full close only.** There are no partial closes. Web is the
   authoritative trading client; native renders PERPs read-only.
8. **Trader PERP P&L is excluded from leagues for launch.** Period P&L still
   exists for truthful profile/portfolio reporting. The current league filters
   exclude PERP trading gains and losses; creator unique-bettor bonuses can
   still count, which deserves a policy check.

## Risk-ranked review path

### 1. Schema and history

Read the seven migrations before the engine. Confirm:

- numeric and timestamp meanings;
- append-only trigger behavior and how corrections would be made;
- public-readable position/event/oracle data is intended;
- the lack of foreign keys and the reliance on engine-level integrity are
  acceptable; and
- `2026072802` will be applied outside a wrapping transaction because it uses
  `create index concurrently`.

### 2. Pure financial logic

Review `common/src/perps/` as one unit. The most important tests are the AMM,
funding, escrow, P&L, oracle, and metric-period suites. Check boundary behavior
for zero pools, extreme leverage, factor-zero ADL, floating-point dust, and
non-finite values.

### 3. Cash-moving engine

Review `backend/shared/src/perps/engine.ts` line by line. In particular:

- every mutation runs in a serializable transaction with a per-contract
  advisory lock;
- authorization, current balance, and oracle freshness are rechecked inside
  the transaction;
- a flip closes the old side before opening the new side atomically;
- request idempotency cannot double-apply balance mutations;
- before and after every cash-moving transition,
  `net M$ txns into contract = poolLong + poolShort` within bounded dust;
- liquidation, ADL, funding, and resolution preserve that invariant; and
- retries do not hide unexpected errors or emit duplicate notifications.

The money-integrity commits are best understood together:
`726b404e6`, `fe88f7e15`, `957fd1963`, `f223b8fbd`, `a6cafbf79`,
`2d9c2d9e0`, `44c7d32e7`, and `9d3c6f2a4`.

### 4. Oracle ingestion and risk jobs

Review the registry and each of the four launch adapters. The registry owns
bounds, jump guards, cadence, staleness, and whether a feed may create markets.
Confirm:

- provider timestamps, Manifold publication timestamps, and engine application
  timestamps are not conflated;
- delayed/out-of-order provider data cannot rewrite history;
- fast and daily feeds receive the intended scheduler cadence;
- daily feed freshness is a job-health signal rather than a false claim of
  intraday price discovery;
- risk processing continues in reduce-only/halted modes; and
- the alert lifecycle is acceptable. Alert policies are manually configured
  GCP state, not infrastructure-as-code in this branch.

One policy worth noticing: after more than seven days stale, repeated feed
errors are demoted to warnings to avoid an alert flood. Confirm that ownership
and market retirement procedures make that safe.

### 5. Accounting and leagues

The engine is authoritative for current/lifetime metrics. A separate
repeatable-read job reconstructs day/week/month values from immutable events,
positions, and oracle marks.

Review `common/src/perps/metric-periods.ts`,
`backend/shared/src/perps/user-contract-metric-periods.ts`,
`user-contract-metrics.ts`, and the generic metric jobs together. Confirm that
adds, funding, flips, close, liquidation, ADL, and settlement reconcile, and
that the job cannot overwrite a concurrent trade.

Period P&L is reporting, not league eligibility. The league job excludes PERP
contracts in SQL and again at runtime. Keep those concerns separate.

Known reporting limitation: a historical boundary uses the newest oracle point
published by the cutoff, not a persisted record of the exact price each
contract had applied. A failed fan-out can therefore create a temporary
difference between the reporting mark and historically executable contract
state.

### 6. Existing-market regressions

This is where many small-looking changes came from. Existing queries often
treated `close_time > now()` as synonymous with “open”; PERPs have no close
time. Review changes to:

- Browse, Explore, unified feed, search, related markets, reposts, topic
  interests, and cache revalidation;
- importance and daily-mover scores;
- global/topic DAU and creator metrics;
- loans, generic bet helpers, resolve/unresolve, movement notifications, and
  market update rules; and
- balance-change and transaction categories.

Discovery ranking is not pinned. It uses committed 24-hour margin volume,
distinct recent human traders, social activity, and absolute 24-hour oracle
movement where relevant. It deliberately avoids leveraged notional and
automated funding. Relative calibration against ordinary markets still needs
observation under real traffic.

### 7. Product surfaces

Verify the dedicated market page first, then compact cards and embeds. The
branch covers:

- Perpetual badge and on-page explainer;
- live price, source attribution, backing pools, funding, leverage, positions,
  trades, holders, stale state, resolution state, and notifications;
- Browse/Explore/search/related cards;
- profile, portfolio, balance log, dashboard, TV, OG/SEO, and read-only native;
- `%[market]`, Add Question, Add Embed, pasted market links, and external iframe
  embeds; and
- future chart endpoint date labels, mixed-cadence history, and labeled embed
  axes (`$`, `%`, or numeric).

Embeds and several cards poll/fetch their own PERP data. Four markets are
reasonable, but a large future PERP catalogue will create N+1 fetches and many
15-second polling loops. This is scale debt, not a day-one blocker.

### 8. Operations and release tooling

Review the launch manifest, preflight, backfills, and deploy behavior after the
runtime code. The manifest is not merely documentation: creation/update paths
permanently enforce official creator, exact title, and required topics for
these feed IDs. Confirm that those should remain canonical rules after launch,
not just pre-launch checks.

The create endpoint defaults to `visibility = 'public'`; the admin UI and
runbook explicitly request unlisted. A direct admin API call can therefore
publish immediately. Decide whether the endpoint itself should default to
unlisted before launch.

`broadcastNewContract` is currently invoked inside the creation transaction,
before commit. Review the small pre-commit visibility/race window and the
failure semantics of doing external work from inside the transaction.

Topic attachment and embedding generation happen after market creation. A
failure can leave a valid but undiscoverable market, which is why the preflight
and discovery-repair script exist.

## Why the weird small changes exist

| Change                                           | Reason                                                                                                                                                                                                       | Recommendation                                                                                                                                                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API deploy shell/PowerShell files                | `PERP_TRADING_MODE` must reach every API container. DEV defaults enabled; PROD deploys require an explicit `enabled`, `reduce-only`, or `halted` so a routine deploy cannot silently clear an incident mode. | Keep, but explicitly approve the new deployment contract. It affects every future PROD API deploy and changing mode still requires an instance roll. Alternate deploy paths can bypass the script guard. |
| No scheduler deploy change                       | Trading mode governs user API actions. Oracle, liquidation, ADL, funding, and resolution must continue during incidents.                                                                                     | Correct; keep.                                                                                                                                                                                           |
| `.gitattributes` CRLF exception                  | Suppresses a line-ending warning for the legacy Windows shell script. No runtime behavior.                                                                                                                   | Optional. Prefer normalizing the file or drop this line if it is only review noise.                                                                                                                      |
| `fflate` in shared, API, and scheduler manifests | Shared ECI code imports it, while each service image installs its own dependency manifest. Missing duplication previously crash-looped DEV scheduler.                                                        | Necessary only while the retained ECI job exists. Decide on ECI first.                                                                                                                                   |
| Generic API client `cache` option                | Post-trade refetches need `no-store`; otherwise a successful trade can be followed by cached pre-trade market/position state.                                                                                | Keep.                                                                                                                                                                                                    |
| URL/HTML/TipTap/embed helpers                    | Preserve localhost/DEV/preview origins, safely recognize Manifold links, and render the right market in mentions/iframes.                                                                                    | Keep; broad but directly supports the launch announcement and DEV QA.                                                                                                                                    |
| `getLinkTarget` / native hook cleanup            | A normal helper was calling a React hook; embed/native work exposed the Rules-of-Hooks problem.                                                                                                              | Valid fix, but reasonable to split as a small standalone refactor.                                                                                                                                       |
| Loan endpoint checks                             | Existing loan math assumes share-based markets; PERPs already provide leverage.                                                                                                                              | Keep the explicit exclusion.                                                                                                                                                                             |
| Generic bet and unresolve checks                 | Prevent routing PERPs through CPMM betting and prevent reversal after PERP settlement has drained positions/pools.                                                                                           | Keep.                                                                                                                                                                                                    |
| Search/related SQL and cache changes             | No-expiry markets have `close_time = null`; old eligibility logic made them invisible or left stale results after unlist/resolve/delete.                                                                     | Keep, but review carefully for ordinary-market regressions.                                                                                                                                              |
| Movement-notification exclusion                  | Oracle movement is not an ordinary user bet; PERPs have dedicated notifications.                                                                                                                             | Keep.                                                                                                                                                                                                    |
| Balance/transaction categories                   | PERP margin, payout, residuals, and liquidation need intelligible accounting rows instead of generic transfers.                                                                                              | Keep.                                                                                                                                                                                                    |
| Exact clean-title rule                           | “Perpetual” is rendered as a badge/explainer rather than duplicated in launch titles.                                                                                                                        | Product choice; the permanent manifest enforcement deserves review.                                                                                                                                      |

## Scope that can be reduced

The clearest unnecessary weight is not the engine or API deploy propagation. It
is historical tooling that has already done its job.

### Strong remove-or-split candidates

- `backend/scripts/rebuild-btc-perp-dev.ts`
- `backend/scripts/rebuild-perp-launch-dev.ts`
- `backend/scripts/cleanup-retired-perps-dev.ts`
- `backend/scripts/verify-perps-dev-state.ts`
- old resolve/recreate, inspect, and purge one-shots for prototype markets

Together, the new scripts directory accounts for over 7,000 added lines. The
launch preflight, the four launch-feed backfills, and the discovery repair
script have durable release value. The rebuild/cleanup scripts mostly preserve
DEV history that is already captured in the audit.

`perp-scratch-drill.ts` is different: it is a valuable manual end-to-end
financial harness and produced the 148-check evidence, but it is almost 2,000
lines and is not a CI test. Keeping it in a separate tooling PR would reduce
the production review without losing it.

### Fix or remove before merge

`run-oracle-tick-loop.ts`, `run-update-perps-once.ts`, and
`refresh-daily-oracles-once.ts` say DEV in comments but trust the active
Firebase project and can write to PROD without a hard environment guard.
Several older one-shots have the same problem. They should not quietly ship as
safe-looking DEV utilities: add a strict DEV guard and confirmation, redesign
them as documented operator tools, or remove them.

### Explicit retain-or-remove decision

ECI cannot create a market, but its adapter, daily scheduler job, history
backfill/purge code, CSV parser, and `fflate` dependencies remain active. This
is not dead code: the scheduler still fetches and stores ECI history. Either
retain that research/history service deliberately or remove the whole stack.
Do not keep it merely because it already exists.

The retired Manifold-DAU prototype also has maintenance scripts. Confirm that
the feed has a post-launch owner or remove those scripts.

### Optional product scope

- The carry path, volatility cone, crowd liquidation bands, and personal
  entry/liquidation/break-even chart overlays add roughly 1,000 lines. They are
  tested and useful, but not required for trading correctness.
- Global DAU, new-user activation, topic DAU, and creator metrics now count PERP
  participation. Semantically sensible, but broader than discoverability and
  worth reviewing as an analytics-definition change.
- Immutable period accounting is substantial. It should stay if PERPs appear
  in day/week/month profile and portfolio views; it could only be deferred by
  explicitly omitting PERPs from those views.
- Native read-only support, dashboard/TV/OG/SEO, and visual polish are
  completeness work rather than financial core. They are reasonable to keep,
  but can be reviewed later in the pass.

## Migrations

Apply only migrations not already present, in this order:

| Order | Migration                                                   | Purpose                                                                                      | Priority                                        |
| ----: | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------- |
|     1 | `2026042201_add_perps.sql`                                  | Oracle, position, event, and funding-event tables; indexes and read policies                 | Required                                        |
|     2 | `2026072801_include_perps_in_related_market_embeddings.sql` | Allows active no-expiry PERPs in related-market embedding SQL                                | Product correctness                             |
|     3 | `2026072802_perp_participation_events_ts_idx.sql`           | Partial time-leading participation index                                                     | Performance; run outside a wrapping transaction |
|     4 | `2026072803_make_oracle_prices_append_only.sql`             | Rejects historical oracle mutation                                                           | Money/audit critical                            |
|     5 | `2026072804_perp_trade_idempotency.sql`                     | Unique retry keys for exposure and close mutations                                           | Money critical                                  |
|     6 | `2026072805_add_oracle_source_time.sql`                     | Separates provider source time from publication time                                         | Oracle/accounting correctness                   |
|     7 | `2026072806_perp_accounting_history.sql`                    | Adds event application and oracle publication time, indexes, and append-only deletion guards | Reporting/audit critical                        |

DEV already has all seven effective migrations. Migration `2806` enables
reliable period reconstruction; it does **not** opt PERP profits into leagues.
PROD should follow the schema-first order in the runbook before API or scheduler
code that expects these columns/triggers.

## Current verification evidence

At implementation snapshot `55f6b8873`:

- `common`: 27/27 suites, 385/385 tests;
- common and shared builds pass;
- API, scheduler, and web no-emit typechecks pass;
- targeted ESLint and Prettier checks pass;
- the production-style web build passes;
- changed native files pass their filtered strict check (the package has
  unrelated existing failures);
- DEV `feeds` and `unlisted` preflights pass with zero failures;
- the single allowed warning is that database state cannot prove an alert was
  delivered to the staffed external inbox;
- four exact unlisted launch markets have clean backing, topics, embeddings,
  fresh feeds, and zero positions;
- the destructive drill passed 148/148 checks across trade, retry,
  funding, liquidation, ADL, settlement, period P&L, notifications, stale-feed
  recovery, league exclusion, and cleanup;
- a clean scheduler cycle processed all four markets;
- signed-in browser QA covered market pages, Browse/Explore/search, comments,
  `%` mentions, pasted links, external embeds, 1W history, endpoint labels,
  axis units, mobile layout, and horizontal overflow; and
- the branch DEV Vercel deployment serves the reviewed embed/card behavior.

Important gap: there is no database-backed automated integration suite in CI.
The destructive drill is strong DEV evidence, but it is manual, stateful, and
not a substitute for repeatable backend integration tests.

## PROD sequence

The detailed commands and fail-closed warning rules are in
`perps-launch-runbook.md`. The intended order is:

1. Complete this human review and decide the cleanup/policy items above.
2. Apply the PROD migrations in order; run the concurrent index separately.
3. Deploy the API with an explicitly reviewed trading mode, deploy the
   scheduler, and verify both deployed revisions.
4. Verify real PROD alert policies and receipt at the staffed on-call inbox.
5. Backfill the four launch feeds and run the `feeds` preflight.
6. Create exactly four markets as unlisted with the official account and
   manifest settings; run discovery repair and the `unlisted` preflight.
7. Deploy the final reviewed web branch.
8. Perform conservative hidden-market trades: open, add, flip, close,
   idempotent retry, liquidation/ADL, settlement, notifications, metrics, and
   league exclusion.
9. Preview the exact launch announcement, including embedded markets.
10. Publish one market at a time, beginning with BTC, and observe real
    Browse/Explore ranking before exposing the next.
11. Move to the final public preflight only after all four are public.

For an incident, roll API instances with `reduce-only` to block exposure
increases while preserving closes, or `halted` if even closes against a
known-corrupt fresh point must stop. Unlisting alone does not block direct API
calls. Keep scheduler risk processing running.

## Sign-off checklist

- [ ] Financial formulas and economic rules approved
- [ ] Engine locking, idempotency, and cash invariant approved
- [ ] Oracle source/cadence/staleness and correction policy approved
- [ ] Migration order, triggers, RLS, and concurrent index approved
- [ ] Period accounting reconciles and league exclusion matches policy
- [ ] Generic discovery/metrics changes do not regress existing markets
- [ ] Create visibility default and permanent manifest rules decided
- [ ] Runtime trading-mode deployment workflow accepted
- [ ] PROD alert policies and staffed-inbox delivery verified
- [ ] ECI and retired-DAU retained-code decision made
- [ ] Unsafe or spent one-shot scripts removed, guarded, or split
- [ ] Hidden PROD smoke pass and exact announcement preview completed
- [ ] Staged public ranking/latency risk explicitly accepted

## Useful commit anchors

The final diff remains the source of truth, but these groups help explain why
areas changed:

- Financial integrity: `726b404e6`, `fe88f7e15`, `f223b8fbd`,
  `a6cafbf79`, `2d9c2d9e0`
- Period accounting and league exclusion: `44c7d32e7`, `10b733c2a`,
  `7b8f1e06d`, `2481b55dd`
- Oracle and scheduler: `ce2e36e83`, `45921f328`, `846752c7d`,
  `3a109617c`, `22ee622cd`, `d60bec60e`
- Discovery and analytics: `d7e9932af`, `d8fe33e9a`, `69ffc416c`,
  `b46824590`, `a3d9b5f3a`, `dfd3fdb7f`, `034ebc7ba`
- Embeds and identity: `02ab90a34`, `6d88a34da`, `b515efc29`,
  `eecf7600f`, `706d40ffe`, `55f6b8873`
- Launch operations: `f55291a1b`, `ef1993a8b`, `b9bb94caf`,
  `ae269f069`, `8dd11898b`
