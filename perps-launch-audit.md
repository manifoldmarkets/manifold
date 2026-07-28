# PERP launch integration audit

- Status: 2026-07-28
- Branch: `perps-launch`
- Operational source of truth: `perps-launch-runbook.md`
- Executable launch definition:
  `backend/shared/src/perps/launch-manifest.ts`

This is the durable status document for the PERP launch review. It covers the
existing Manifold product surfaces, discovery behavior, accounting and
lifecycle boundaries, launch feeds, operational state, and remaining work.
`perps-launch-plan.md` is the historical implementation plan; use this audit
and the runbook for current decisions.

The Epoch Capabilities Index frontier is not in the launch set. It is mentioned
only where its retained feed or legacy DEV market affects launch safety.

## Executive verdict

The branch and DEV environment are release-candidate complete. There is no
known code, schema, accounting, or DEV-data blocker. Public launch is a
**conditional go** after the remaining human and PROD rollout gates: human code
review, PROD migrations, deployment from one reviewed commit, hidden-market
live testing, and the final announcement/public flip.

| Area                             | Status                      | Meaning                                                                                                                                                                         |
| -------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core math, accounting, lifecycle | Pass in code/tests          | Backing, solvency, funding, liquidation/ADL, settlement, and idempotency have explicit guards and tests.                                                                        |
| Web integration                  | Pass on deployed DEV        | Market page, cards, browse, explore, search, related markets, embeds, mentions, dashboards, profile, TV, SEO/OG, and notifications understand PERPs.                            |
| Native safety                    | Pass, read-only             | Current native clients no longer treat PERPs as binary or crash; they show a safe summary and link through. Native trading is not implemented.                                  |
| Automated verification           | Pass                        | 26 common suites / 382 tests, common/shared builds, API/web/scheduler typechecks, targeted ESLint/Prettier, and diff checks pass at the audited working tree.                   |
| DEV schema                       | Pass                        | All six July PERP follow-up migrations are installed; required tables, columns, indexes, append-only triggers, and related-market SQL all pass preflight.                       |
| DEV launch dataset               | Pass                        | Exactly four clean manifest markets are unlisted, pristine, solvent, correctly funded, and have required topics/embeddings; legacy and ECI prototypes are retired.              |
| DEV release preflight            | Pass                        | Both `feeds` and `unlisted` phases completed with 0 failures. The sole warning is that database inspection cannot prove delivery to the external on-call inbox.                 |
| Destructive launch drill         | Pass                        | The disposable DEV drill completed 148 checks with 0 failures, then resolved and soft-deleted every market it created while preserving immutable history.                       |
| Oracle-latency exposure          | Accepted launch risk        | Exact, zero-fee execution at a cached public oracle is pick-offable. Launch accepts bot competition under the manifest caps and monitors pool transfer.                         |
| Signed-in visual smoke           | Pass on deployed DEV        | Market/embed pages, comment embeds, Add Question, Add Embed, `%` selection, chart endpoint labels, tabs, and accessibility labels were exercised without submitting test posts. |
| Period-specific PERP P&L         | Pass; excluded from leagues | Day/week/month P&L is correct and user-visible, while launch-season league `mana_earned` and breakdowns deliberately exclude PERP gains and losses.                             |

Do not turn the markets public merely because DEV is green. The final rollout
must still be made from the human-reviewed commit. Compare the PROD migration
ledger, install every unapplied PERP migration schema-first, deploy API and
scheduler before web, create/test the four markets while unlisted, and invoke
the staged-rollout/public preflights with the explicit cached-oracle risk
acknowledgment, warning allowlist, and recorded day-one caps. The migrations
already installed on DEV must not be rerun there.

## Direct answers to the launch questions

### Embeds and `%[perp market]` mentions

Implemented.

- The external `/embed/[username]/[contractSlug]` route prefixes the title
  with a visible `Perpetual` type pill, displays the oracle/final price rather
  than a probability, renders a labelled seven-day sparkline, preserves
  oracle-source attribution, and shows backing, funding, leverage, market
  status, and an appropriate trade/view call to action.
- The embedded contract polls live fields without rewinding a newer oracle
  point or resurrecting a settled market. Stale/unavailable feeds fail closed,
  and resolved/cancelled cards stop advertising trading or funding.
- Pasted Manifold URLs preserve their environment across PROD, DEV,
  `manifold.love`, localhost, and same-origin Vercel previews instead of
  silently rewriting every embed to production.
- The rich-text `%` market picker receives `oraclePrice` in the lite market
  payload, prefixes PERP suggestion titles with the same full type pill, and
  shows the formatted oracle price.
- A persisted `%[market]` mention renders through the PERP-aware
  `ContractMention` component with the type pill before its title, so the
  launch announcement can reference these markets inline.
- Related-market cards, compact rows, activity cards, and link previews also
  identify the type and do not present a fake binary probability.

The signed-in browser pass selected BTC through `%` autocomplete, Add Question,
and Add Embed, and rendered the direct deployed DEV `/embed/...` route with the
Perpetual label, live price, source, chart, backing, funding, leverage, and
trade link. Drafts were discarded without posting. The iframe generator
escapes the question in its `title`, and persisted TipTap iframes preserve an
accessible title. The exact launch-announcement composition remains a human
pre-publication check after the final PROD web deploy.

### Discoverability, rankings, and Explore

PERPs participate in the same bounded importance score as other public
markets. There is no permanent "PERP bonus" or penalty that pins them to the
top or prevents them from rising.

The importance calculation includes:

- 24-hour traded volume;
- distinct traders in the last hour, day, and week;
- likes and comments;
- ordinary ranked/unranked treatment;
- explicit paid boosts; and
- the same bounded score normalization as other market types.

`open`, `add`, and user `close` events count as trading activity. Resolution
settlements and automated risk transitions do not create fake traders.
Oracle ticks themselves do not count as engagement.

The daily-mover score uses the absolute 24-hour endpoint log return of the
oracle, multiplied by recent engagement. This is scale-independent, so a
one-percent BTC move and a one-percent approval-rating move are comparable.
Funding imbalance is deliberately not used as a movement proxy because it can
stay high while the oracle is flat.

Consequences:

- a PERP can rise when it has real traders, volume, discussion, or a genuine
  price move;
- it falls as its hourly/daily/weekly activity windows roll off;
- a high-frequency feed does not dominate merely because it emits many ticks;
- a moving feed with no users does not automatically monopolize daily movers;
  and
- a paid boost behaves like a boost on another market, not like backing.

The Explore/unified feed excludes STONKs and bountied questions, not PERPs.
Public PERPs are therefore eligible. User `open`, `add`, and manual `close`
events now also produce typed Explore activity rows, using absolute committed
margin for the ordinary minimum-trade threshold. Funding, liquidation, ADL,
settlement, and the automatic close half of a flip are excluded. These rows
are not fabricated binary bets.

Launch creation automatically attaches each environment's required topic and
generates a related-market embedding. The preflight verifies both, and the
idempotent discovery backfill repairs older prototypes. Related-market API
results re-check public/unresolved/not-deleted eligibility and use short-lived
membership caches, so an unlisted, resolved, or deleted market does not remain
visible for six hours. Unlisted markets are intentionally absent from public
Browse/Explore until rollout.

This design is sane, but relative calibration cannot be proven from four DEV
markets. The runbook therefore exposes one market at a time and requires an
observed rank check before exposing the next. Post-launch telemetry should
compare PERP impressions, clicks, unique traders, and repeat traders with the
ordinary market distribution; tune shared score weights only from that data.

### Browse identity and the misleading `0 liquidity`

Implemented.

- Cards, tables, dashboards, related markets, mentions, TV, and embeds prefix
  the title with a visible `Perpetual` type pill.
- The main value is the formatted oracle price, not `0%` or a binary chance.
- Feed cards can show a price sparkline.
- The backing row uses `poolLong + poolShort` as market backing.
- API/MCP lite market payloads expose `oraclePrice` and `backingPool`
  explicitly rather than inventing an AMM liquidity tier.
- The `Subsidy` sort can compare PERP backing with other creator subsidy.
- The CPMM `Liquidity`/elasticity sort deliberately leaves PERPs last because
  backing is not an equivalent elasticity measure. A future cross-mechanism
  ranking would need a shared slippage/capacity definition rather than
  relabeling backing as CPMM liquidity.

"Backing" is the correct label. The two pools are cash backing for the
parimutuel liabilities; calling that ordinary CPMM liquidity would imply the
wrong mechanism.

On the full market page, the pill is a real button immediately before the
title. It opens an accessible on-page explainer covering the oracle, long and
short exposure, leverage, liquidation and ADL, funding, no expiry, stale-feed
pauses, and the initial league-scoring exclusion. In cards and links the pill
remains a non-interactive label so it never creates a nested button.

### Future date at the graph extension

Implemented and tested.

The price chart extends its x-domain through the hold-cost projection horizon.
D3's generated ticks do not guarantee that an arbitrary endpoint is included,
so the chart now reserves space and draws an explicit final tick at the exact
future projection endpoint. The label is inserted even when no normal tick is
appropriate there.

### ECI

Excluded at three layers:

1. `eci-frontier` has `marketCreationEnabled: false` in the feed registry.
2. `create-perp` rejects a feed that is disabled for market creation.
3. The launch manifest excludes ECI, and public preflight fails if any
   unresolved ECI PERP exists.

The reason is structural, not cosmetic: a running maximum can stay flat or
rise but cannot fall, so it has a dominant long direction and turns shorts
into funding inventory. Leverage, pool size, and funding tuning cannot repair
that game.

The retained adapter/history is harmless. The legacy DEV ECI market is now
resolved and soft-deleted with its immutable accounting history retained. It
is absent from the clean launch dataset and must never be recreated or copied
into PROD.

## Product-surface audit

| Surface                         | Result                    | Notes                                                                                                                                                          |
| ------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full web market page            | Pass                      | Dedicated overview, live price, funding, positions, trade controls, stale-feed explanation, source attribution, and price/funding charts.                      |
| Browse/search tables            | Pass                      | Badge, oracle price, backing display and subsidy sort; CPMM elasticity sort leaves incomparable PERPs last; no fake probability.                               |
| Home/Explore feed               | Pass                      | Eligible as an ordinary public market; PERP trades feed importance, participation, and typed user activity; empty-topic “For you” routing is tested.           |
| Activity/feed cards             | Pass                      | Badge, price, sparkline, backing, and user open/add/close rows without automated accounting noise.                                                             |
| Topic and related markets       | Pass in code/DEV schema   | Creation auto-attaches manifest topics and generates embeddings; cached group fallbacks re-fetch and re-check current eligibility with no HTTP response cache. |
| `%` rich-text mentions          | Pass on deployed DEV      | Picker, `%[...]`, pasted-link conversion, and rendered mention are PERP-aware.                                                                                 |
| External embed                  | Pass on deployed DEV      | Live/settled state, badge, price, backing, funding, leverage, sparkline, attribution, accessible iframe title, and state-aware CTA.                            |
| SEO/Open Graph                  | Pass                      | PERP title/price semantics; no binary probability claim.                                                                                                       |
| Dashboard cards                 | Pass                      | Shows direction, current position value, and lifetime profit.                                                                                                  |
| Profile/portfolio current state | Pass                      | Synthetic contract metrics include position value, funding-inclusive realized payouts, direction, and lifetime P&L.                                            |
| Position reduction              | Deliberate v1 limitation  | Users can add, fully close, or atomically flip; there is no partial-close control or endpoint yet.                                                             |
| Daily/weekly per-contract P&L   | Pass in code/tests        | Reconciled event replay includes funding, new margin, flips, exits, liquidation, ADL, and settlement; see the dedicated section below.                         |
| Notifications and balance log   | Pass                      | Liquidation, ADL, trade, funding, and settlement rows are type-safe and readable.                                                                              |
| Email market values             | Pass                      | PERPs format oracle/settlement price, and weekly mover selection reads the replayed weekly P&L.                                                                |
| League scoring                  | Excluded by launch policy | User-facing PERP P&L remains visible, but position gains and losses do not change `leagues.mana_earned`.                                                       |
| TV                              | Pass                      | Read-only display now carries a Perpetual badge and oracle/settlement price.                                                                                   |
| Public API and MCP              | Pass                      | Lite/full shapes expose PERP price/backing without fake liquidity. Generic binary bet APIs reject the mechanism.                                               |
| Active native app (`mani`)      | Safe read-only            | Dedicated summary/page and safe feed/profile/notification/ledger rendering. It does not expose a misleading binary bet panel.                                  |

## Accounting, risk, and lifecycle audit

### Creation and authorization

- PERP creation is admin-only and registry-gated.
- The endpoint validates feed price bounds, oracle-age configuration, finite
  numeric inputs, topic IDs, and initial backing. Manifest launch feeds
  automatically receive their required environment-specific topic in an
  atomic attachment.
- Manifest feeds can be created only by the environment's official Manifold
  account because residual backing returns to the creator at settlement.
- The admin form defaults to unlisted and exposes a one-click application of
  the manifest leverage, annual funding cap, sensitivity, oracle-age, and
  per-side backing recommendation. It visibly reports when the current form
  differs, fails closed if registry/recommendation loading fails, and blocks
  the wrong creator account.
- New contracts freeze `initialPoolLong` and `initialPoolShort`, allowing
  preflight to audit launch skew after live trading changes the current pools.
- Trading bans and endpoint authorization apply to opens/increases.
- Generic bet, add-liquidity, remove-liquidity, loan, rebalance, unresolve, and
  binary-only workflows either reject PERPs or exclude them explicitly.
- API runtime mode `reduce-only` blocks creation and new/increasing exposure
  while preserving ordinary closes. `halted` additionally blocks user closes
  for a known-corrupt-but-still-fresh oracle. Both modes deliberately leave
  liquidation, funding, and resolution running. An invalid mode fails closed.

### Trade and cash integrity

- Open and close requests support database-enforced idempotency keys.
- Balance mutations and event writes are part of the same transaction.
- The engine asserts that pool cash matches the market backing ledger.
- New exposure is capped against opposing-pool capacity. Existing oversized
  legacy positions can reduce but cannot increase.
- All financial entry points reject non-finite or invalid numeric values.
- Synthetic `user_contract_metrics` use current position value plus historical
  realized payouts, including funding transferred into margin before a close.

### Oracle integrity and stale behavior

- Oracle and PERP event histories reject both mutation and deletion after the
  accounting-history migration.
- Source observation time, provider dataset time, Manifold publication time,
  and PERP transition application time are separate. Delayed or batched data
  can therefore be attributed and assigned to accounting periods without
  pretending it was available earlier.
- Settlement selects a chronologically valid published point and validates it
  with the same feed bounds.
- Price application, liquidation, and ADL remain atomic. There is no unsafe
  "cheap cache update" that bypasses risk processing.
- A stale or missing feed pauses both opens and closes at the freshness
  boundary and explains the pause in the UI. This prevents cherry-picking an
  old executable price.
- The global incident flag is different: it blocks opens/increases but leaves
  closes available.

### Funding, liquidation, and ADL

- A new market waits a full configured funding period before its first charge.
- Funding cadence is per contract and is checked again under the transaction
  lock, preventing double-runs.
- Funding and ADL preserve pool cash and solvency invariants.
- Liquidation and ADL emit dedicated events and user notifications.
- Terminal ADL is explained as a parimutuel solvency action rather than being
  silently presented as an ordinary close.

### Settlement and shutdown

- PERP resolution settles every remaining position at the validated final
  oracle price, updates balances and metrics, notifies holders, clears open
  positions, refreshes caches, and leaves an auditable event reason.
- Unresolve is explicitly blocked because reconstructing settled leveraged
  positions would not be safe.
- The user-facing binary resolution control is hidden for PERPs; settlement is
  an intentional admin/API operation.
- A normal wind-down should be announced, promotion stopped, and positions
  settled at a validated current oracle point. A source-integrity incident
  should preserve history and wait for a defensible point rather than
  publishing an invented one.

## Accepted launch risk: cached-oracle latency arbitrage

All four launch feeds are public before Manifold's cache necessarily updates.
The engine currently opens and closes at that exact cached price with no spread
or fee. A trader can see the source move, trade against the old cache, and exit
after ingestion. If the trader is flat at the funding timestamp, funding
provides no protection.

| Feed             | Exposure                                                                                                              |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- |
| BTC/USD          | Exchange quotes can lead the 15-second poll.                                                                          |
| UK grid carbon   | Finalized batches and published forecasts can lead ingestion.                                                         |
| Trump approval   | The public daily step and scheduler timing are predictable.                                                           |
| OpenRouter share | Upstream currently completes roughly one UTC-day value; repeated hourly cache writes do not hide the next daily step. |

Larger pools, more identical ticks, or a larger funding cap do not fix this.
This is not a solvency bug: every payout is still bounded by the cash pools,
open-interest limits, liquidation, and ADL. It is a transfer/game-design risk:
fast traders and bots can extract some of that backing from slower traders or
the opposing pool. The launch decision is to allow that competition under the
manifest's conservative backing and leverage caps, measure realized transfers,
and revisit execution design if the observed subsidy is too large.

The durable alternatives remain:

1. refresh and validate the source at trade time, with explicit outage/fallback
   behavior;
2. charge a spread/fee large enough to cover the source-to-cache latency
   window;
3. use a discrete execution/cutoff mechanism for slow public-step feeds; or
4. continue accepting the risk, with explicit leverage/backing limits,
   monitoring, and a named owner.

The suggested alternative—let an endogenous AMM or order-book price move while
the oracle is used later for settlement—is coherent, but it is a different
market mechanism rather than a small patch. It would reward early information
by moving the quote before the oracle update. It would also introduce basis
risk, convergence rules, mark-versus-index liquidation policy, manipulation
surface, and a decision about who supplies liquidity and absorbs arbitrage.
Bots would still participate; their role would shift from picking off a stale
fixed quote to arbitraging the market quote toward the expected oracle.

The staged-rollout and public preflights fail unless
`--acknowledge-latency-risk` is supplied. That flag records this product
acceptance; it does not claim a mitigation. Every other warning is fail-closed
unless its printed key is explicitly allowed, and a stale unused allowance
also fails. The sole standing allowance is the manual external-alert-delivery
check. Expose BTC first, retain the manifest caps, and inspect realized pool
transfers before adding the slower feeds.

## Period-specific PERP P&L

Implemented without duplicating the AMM math.

- Every event records `applied_ts`, distinct from its effective/source `ts`.
- Every oracle row records immutable `published_at`, so a delayed provider
  point cannot be used at a boundary before Manifold actually knew it.
- The period job reads current metrics, positions, recent events, contracts,
  and boundary oracle marks from one repeatable-read snapshot.
- It reverses at most 30 days of events from the authoritative current
  position, ordered by append-only event id.
- It reconstructs entry price and margin through adds, funding, flips,
  liquidation, partial or terminal ADL, and resolution.

For each boundary the identity is:

`period P&L = current position value + payouts since boundary - boundary
position value - new margin since boundary`

`profitPercent` uses boundary position value plus new margin as its
denominator. That is consistent and useful for sorting, but it is not a
time-weighted return when a user repeatedly closes and recycles capital.

Boundary valuation uses the newest feed-effective point that Manifold had
published by the cutoff, while current value uses the contract's cached oracle
mark. The boundary rule is deliberate and deterministic. It can briefly differ
from the price executable on one contract because publishing a feed point and
applying it to every contract are separate transactions, and an individual
application can fail. Exact historical executable-price attribution would
require a per-contract oracle-application log; that is a reporting refinement,
not a balance or event-accounting risk.

The engine remains the sole owner of current and lifetime metric fields. The
period job atomically patches only `ContractMetric.from`, while engine upserts
preserve the latest `from`; this avoids a trade/funding race overwriting either
side. Automated funding, ADL, liquidation, and resolution no longer update
`lastBetTime`, so passive holders do not become fake weekly traders.

These rolling metrics are for user reporting and portfolio surfaces. They are
not league inputs. Launch policy excludes PERP position gains and losses from
`leagues.mana_earned`; enabling them later requires an explicit season-boundary
decision and a separate league-accounting review.

Malformed or incomplete history fails closed and leaves the prior period block
unchanged rather than publishing a fabricated zero. The launch migrations and
clean market recreation are required because legacy DEV rows can only
backfill application/publication time approximately.

## Latest DEV evidence

At **2026-07-28 10:53 UTC**, both read-only release gates were green:

- `perp-launch-preflight.ts --phase=feeds`: **0 failures, 1 warning**;
- `perp-launch-preflight.ts --phase=unlisted --allow-warning=external-alert-policies`:
  **0 failures, 1 warning**; and
- `backfill-perp-launch-discovery.ts` dry-run: four markets found, zero
  missing, zero topic repairs, and zero embedding repairs.

The single warning is deliberate: a database preflight cannot prove that a GCP
incident reached the final human inbox. The error, oracle-absence, and
funding-absence alert policies are enabled and routed to the configured email
channel. A synthetic incident opened and closed normally, but an on-call human
must still confirm real destination receipt during the PROD rollout.

The exact clean unlisted dataset is:

| Feed                         | Contract       | Slug                                  | Backing | Open positions |
| ---------------------------- | -------------- | ------------------------------------- | ------- | -------------- |
| BTC/USD                      | `n98l6pzCNUIO` | `bitcoin-price-usd-5UhA`              | M50,000 | 0              |
| UK grid carbon               | `zlg8CpOl290P` | `uk-grid-carbon-intensity-gcokwh`     | M20,000 | 0              |
| Trump approval               | `ALhU6qIL6Oun` | `trump-approval-rating-h2yt`          | M10,000 | 0              |
| OpenRouter open-weight share | `ydAULhqg58A0` | `openweight-ai-token-share-on-openro` | M20,000 | 0              |

Every market has the official DEV creator, native MANA token, clean manifest
title/economics, required topic, related-market embedding, fresh cached oracle,
correct funding period, exact ledger/pool backing, and no positions or prior
participation events. All four remain unlisted, so their absence from public
Browse/Explore is intentional until rollout.

The guarded cleanup then:

- soft-deleted, unlisted, and unranked exactly 27 resolved legacy/prototype
  PERPs, including ECI;
- deleted exactly 45 derived `user_contract_metrics` rows, including the 19
  non-replayable legacy period rows;
- preserved PERP events, funding history, txns, balances, embeddings, topics,
  notifications, and edit history;
- protected against the sibling-contract update trigger and verified that no
  target had a sibling; and
- reran as a verified no-op with zero legacy metric rows remaining.

The post-cleanup destructive DEV drill ran from 10:27–10:29 UTC and completed
**148 passed, 0 failed**. It exercised open/add/flip/close, duplicate and
conflicting idempotency keys, capacity rejection, funding cadence,
liquidation, ADL, final-price liquidation, holder notifications, stale-feed
open/close gating and recovery, settlement, escrow/balance reconciliation,
day/week/month P&L, and league exclusion. Its five disposable markets were
resolved, zeroed, soft-deleted, and stripped of derived metrics; temporary
league enrollments were removed. A final read-only drill preflight found no
active or resolved-but-unretired drill markets.

Scheduler evidence is also clean: the first post-rebuild hourly
`update-perps` run found exactly four live markets, processed all four on their
first attempt, wrote the next funding heartbeat, and emitted no scheduler
error. Subsequent preflight saw current oracle and scheduler heartbeats.

The deployed web at `dev.manifold.markets` serves the `perps-launch` branch.
Direct market and embed pages show the full Perpetual treatment. The Bitcoin
1W graph includes the future hold-cost endpoint timestamp and hourly funding
marks. Add Embed, Add Question, and `%` autocomplete all selected the clean
Bitcoin market and rendered the live deployed card; no test comment was
submitted.

No additional migration or cleanup is required on DEV.

## Required release sequence

1. **Human review:** review the complete `perps-launch` diff and choose one
   exact commit SHA. Do not add feature work after approval; fixes require a
   new review checkpoint.
2. **PROD schema first:** keep PERPs disabled and their jobs paused. Compare
   the production migration ledger and apply only unapplied migrations, in
   order: `2026042201_add_perps.sql`,
   `2026072801_include_perps_in_related_market_embeddings.sql`,
   `2026072802_perp_participation_events_ts_idx.sql`,
   `2026072803_make_oracle_prices_append_only.sql`,
   `2026072804_perp_trade_idempotency.sql`,
   `2026072805_add_oracle_source_time.sql`, and
   `2026072806_perp_accounting_history.sql`. The `2802` concurrent index must
   run outside an encompassing transaction. A code deploy never installs
   database objects.
3. **Backend deploy:** deploy API and scheduler from the reviewed SHA, provision
   `OPENROUTER_API_KEY`, configure `PERP_TRADING_MODE=enabled`, resume the jobs,
   and run `--phase=feeds`. Require zero failures and fresh scheduler/oracle
   heartbeats before creating markets.
4. **Hidden markets:** create exactly the four manifest markets through the
   official PROD Manifold account with unlisted visibility and the displayed
   recommendations. Confirm the account has at least M100,000 first. Never
   create ECI. Run the discovery dry-run, then:

   ```powershell
   npx.cmd ts-node perp-launch-preflight.ts --phase=unlisted --allow-warning=external-alert-policies
   ```

   Require zero repairs, zero failures, and only that one reviewed warning.

5. **Web deploy last:** merge/deploy the reviewed web branch only after the
   schema, backend, feeds, and hidden dataset are ready. Confirm the deployed
   commit and environment before testing any generated embed.
6. **Hidden live testing:** on the real unlisted PROD markets, make conservative
   minimal-value open/add/flip/full-close and idempotency checks; reconcile
   balances, pools, positions, events, metrics, and notifications without
   materially seeding ranking volume. Verify search-by-direct selection,
   market pages, Add Question, Add Embed, `%` mentions, and the exact
   launch-announcement draft.
7. **Operations sign-off:** deliver a real alert to the staffed on-call
   destination, record the owner and exact day-one caps for the accepted
   cached-oracle latency risk, and retain the preflight/drill evidence.
8. **Announcement and live rollout:** publish one market at a time, starting
   with BTC. After each partial flip, invoke `--phase=rollout` with the
   cumulative `--public-feed` set, `--acknowledge-latency-risk`, and only the
   external-alert warning allowance. Inspect Browse/Explore rank, impressions,
   pool movement, and unique/repeat traders before exposing the next feed.
   After all four are public, invoke the final `--phase=public` gate; it must
   emit exactly four acknowledged latency warnings plus the one allowed
   external-alert warning.

Rollback uses the API runtime `PERP_TRADING_MODE` and a service-instance roll,
not a source edit. `reduce-only` blocks creation/opens/adds/flips while
preserving closes; `halted` also blocks closes against a known-corrupt fresh
point. Unlist affected markets in either case. Restore a valid feed before
re-enabling; never fabricate an oracle point to clear a warning. Scheduler risk
processing and resolution remain active.

## Verification performed at the audited HEAD

- `common`: 26/26 test suites, 382/382 tests.
- TypeScript builds: `common` and `backend/shared`; no-emit typechecks:
  `backend/api`, `backend/scheduler`, and `web`.
- Targeted API/shared/scripts/common/web ESLint and scoped Prettier checks.
- Changed `mani` files pass their filtered strict TypeScript check; the full
  native package still has unrelated pre-existing type failures.
- Live DEV `feeds` and `unlisted` preflights both complete with zero failures;
  discovery dry-run reports zero repairs, and all four clean launch markets
  have exact backing and zero positions.
- The destructive DEV drill completed 148/148 checks covering trade,
  idempotency, capacity, funding, liquidation, ADL, settlement, period P&L,
  notifications, stale-feed recovery, league exclusion, and self-cleanup.
- The legacy cleanup retired 27 pinned markets and removed 45 derived metrics,
  then passed its no-op rerun without changing immutable history or balances.
- Signed-in browser smoke covered full and embedded PERP routes, Add Question,
  Add Embed, `%` autocomplete, pasted-link conversion, tabs, backing/funding
  display, live/settled card semantics, chart endpoint/funding-mark
  accessibility, the repaired OpenRouter 1W path, and horizontal overflow.
- The custom `dev.manifold.markets` domain was verified against the
  `perps-launch` Vercel build. Existing/direct iframe URLs render the live
  trade-ready card, and editor drafts were discarded without posting.
- A clean hourly scheduler cycle processed all four launch markets and wrote
  the expected funding heartbeat without scheduler errors.
- The fail-closed warning gate passed with the one explicit external-alert
  allowance and failed, as designed, when that allowance was omitted.
- Focused discovery tests cover authenticated empty-topic “For you” routing
  plus cold/warm related-market eligibility after unlist, resolution, deletion,
  and cache reuse.
- Formatting and `git diff --check` on each implementation commit.

Still deliberately human/PROD-only: final code review, verification of actual
on-call inbox receipt, PROD migration/deploy execution, conservative trades on
the real hidden PROD markets, preview of the exact announcement composition,
and observed public ranking calibration under real traffic.

## What was added during this review

The review was committed as small, revertible changes. The pushed history
includes:

- discovery/ranking, Browse identity/backing, chart endpoint labels, external
  embeds, `%` mentions, compact listings, related markets, APIs, dashboard,
  and TV integration;
- authorization, idempotency, backing-ledger and open-interest caps, oracle
  chronology/immutability, stale-feed UX, funding timing, settlement
  propagation, and funding-inclusive realized P&L;
- participation analytics, notification/ADL clarity, source attribution,
  launch feed validation, ECI creation exclusion, and native-client safety;
- typed user PERP activity in Explore, current-state privacy filtering for
  feeds/related markets, automatic launch topics, an idempotent discovery
  backfill, embed accessibility hardening, and safer unlisted admin defaults;
- restored authenticated empty-topic “For you” routing and fail-closed
  cold/warm group-related eligibility without an hour-long response cache;
- reconciled day/week/month PERP accounting with immutable
  application/publication history and race-safe metric ownership;
- the executable four-market launch manifest, preflight, operational runbook,
  progressive rollout and warning gates, runtime incident modes, clean title
  enforcement, full `Perpetual` title prefixes, and the on-page product
  explainer;
- live, environment-preserving, trade-ready embeds with state-aware stale and
  settlement behavior; and
- guarded DEV legacy retirement plus a repeatable destructive launch drill
  that cleans up its own markets and derived metrics.

The commit history on `perps-launch` is the authoritative itemized record.

## Recommended Codex operating model

Continuous context in one chat is not required. Repository documents and
small commits are better durable memory than a very long transcript.

For this branch:

1. Keep one integration branch and these two current source-of-truth files:
   this audit for status/decisions and the runbook for execution.
2. Start each new Codex session by asking it to read `AGENTS.md`, all relevant
   `CLAUDE.md` files, this audit, the runbook, `git status`, and recent branch
   commits before editing.
3. Split future work by coherent risk boundary, not by arbitrary file count:
   - oracle execution/mechanism redesign, if monitoring justifies it;
   - database migration and operational rollout;
   - signed-in web visual QA and ranking telemetry; and
   - native trading, if it becomes a product priority.
4. Keep tightly coupled mechanism changes in one session. A spread, fee,
   trade-time refresh, funding, or ADL change crosses `common`, backend, and UI
   and should be reviewed and tested as one financial unit.
5. Continue one-purpose commits and push each verified checkpoint. A later
   session can recover context from the audit plus `git log` without replaying
   this conversation.
6. Use a new session after a clear milestone if the current context becomes
   noisy. Do not create several independent branches that redesign the same
   engine concurrently.

The best next session is the human review and PROD rollout described above,
not another feature pass. Treat endogenous price discovery, partial closes,
and native trading as separately specified post-launch work. Revisit the
execution mechanism only if launch telemetry shows that the accepted
oracle-latency subsidy is material.
