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

The application integration is substantially complete. Public launch is still
a **conditional no-go** until the release gates below are closed.

| Area                             | Status                   | Meaning                                                                                                                                                            |
| -------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Core math, accounting, lifecycle | Pass in code/tests       | Backing, solvency, funding, liquidation/ADL, settlement, and idempotency have explicit guards and tests.                                                           |
| Web integration                  | Pass locally             | Market page, cards, browse, explore, search, related markets, embeds, mentions, dashboards, profile, TV, SEO/OG, and notifications understand PERPs.               |
| Native safety                    | Pass, read-only          | Current native clients no longer treat PERPs as binary or crash; they show a safe summary and link through. Native trading is not implemented.                     |
| Automated verification           | Pass                     | 23 common suites / 336 tests, common/shared builds, API/web/scheduler typechecks, targeted ESLint/Prettier, and diff checks pass at the audited working tree.      |
| DEV schema                       | **Pass**                 | All six July PERP migrations are installed; required tables, columns, indexes, append-only triggers, and related-market SQL all pass preflight.                    |
| DEV release preflight            | **Fail: legacy dataset** | The 2026-07-28 05:55 UTC feed run found 9 failures and 16 warnings. None is a missing migration; the causes are listed under “Latest DEV evidence.”                |
| Oracle-latency exposure          | Accepted launch risk     | Exact, zero-fee execution at a cached public oracle is pick-offable. Launch accepts bot competition under the manifest caps and monitors pool transfer.            |
| Signed-in visual smoke           | Pass locally             | Desktop/mobile pages, Browse, Explore, `%` selection, pasted-link mentions, external embeds, chart endpoint labels, tabs, and accessibility labels were exercised. |
| Period-specific PERP P&L         | Pass in code/tests       | Day/week/month values reverse the append-only position history from one consistent database snapshot, including funding, flips, liquidation, ADL, and settlement.  |

Do not turn the four markets public merely because the branch builds. First
create a clean unlisted launch dataset, deploy the final API/web code, obtain a
zero-failure preflight, run the balance-changing smoke cases, and invoke the
public preflight with the explicit cached-oracle risk acknowledgment and
recorded day-one caps. The six migrations already installed on DEV do not need
to be rerun; they will still be schema-first rollout steps on PROD.

## Direct answers to the launch questions

### Embeds and `%[perp market]` mentions

Implemented.

- The external `/embed/[username]/[contractSlug]` route prefixes the title
  with a visible `Perpetual` type pill, displays the oracle price rather than a
  probability, renders a PERP sparkline, and preserves oracle-source
  attribution.
- The rich-text `%` market picker receives `oraclePrice` in the lite market
  payload, prefixes PERP suggestion titles with the same full type pill, and
  shows the formatted oracle price.
- A persisted `%[market]` mention renders through the PERP-aware
  `ContractMention` component with the type pill before its title, so the
  launch announcement can reference these markets inline.
- Related-market cards, compact rows, activity cards, and link previews also
  identify the type and do not present a fake binary probability.

The signed-in local browser pass selected BTC through both `%Bitcoin` and
`%[bitcoin]` autocomplete flows, converted a pasted market URL into the same
structured mention, and rendered the direct `/embed/...` route with the
Perpetual label, oracle price, source, chart, and trade link. The iframe
generator now escapes the question in its `title`, and persisted TipTap
iframes preserve an accessible title. The launch announcement must still be
previewed after the final web deploy because its generated iframe URL targets
the deployed DEV host, not `localhost`.

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

The retained adapter/history is harmless. The unresolved legacy ECI market in
DEV is not: it correctly causes preflight to fail and must not be copied into
the public launch dataset.

## Product-surface audit

| Surface                         | Result                    | Notes                                                                                                                                     |
| ------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Full web market page            | Pass                      | Dedicated overview, live price, funding, positions, trade controls, stale-feed explanation, source attribution, and price/funding charts. |
| Browse/search tables            | Pass                      | Badge, oracle price, backing display and subsidy sort; CPMM elasticity sort leaves incomparable PERPs last; no fake probability.          |
| Home/Explore feed               | Pass                      | Eligible as an ordinary public market; PERP trades feed importance, participation, and typed user activity.                               |
| Activity/feed cards             | Pass                      | Badge, price, sparkline, backing, and user open/add/close rows without automated accounting noise.                                        |
| Topic and related markets       | Pass in code/DEV schema   | Creation auto-attaches manifest topics and generates embeddings; preflight/backfill gate old rows; results re-check current visibility.   |
| `%` rich-text mentions          | Pass locally              | Picker, `%[...]`, pasted-link conversion, and rendered mention are PERP-aware.                                                            |
| External embed                  | Pass locally              | Badge, price, sparkline, attribution, accessible iframe title, and trade link.                                                            |
| SEO/Open Graph                  | Pass                      | PERP title/price semantics; no binary probability claim.                                                                                  |
| Dashboard cards                 | Pass                      | Shows direction, current position value, and lifetime profit.                                                                             |
| Profile/portfolio current state | Pass                      | Synthetic contract metrics include position value, funding-inclusive realized payouts, direction, and lifetime P&L.                       |
| Position reduction              | Deliberate v1 limitation  | Users can add, fully close, or atomically flip; there is no partial-close control or endpoint yet.                                        |
| Daily/weekly per-contract P&L   | Pass in code/tests        | Reconciled event replay includes funding, new margin, flips, exits, liquidation, ADL, and settlement; see the dedicated section below.    |
| Notifications and balance log   | Pass                      | Liquidation, ADL, trade, funding, and settlement rows are type-safe and readable.                                                         |
| Email market values             | Pass                      | PERPs format oracle/settlement price, and weekly mover selection reads the replayed weekly P&L.                                           |
| League scoring                  | Excluded by launch policy | User-facing PERP P&L remains visible, but position gains and losses do not change `leagues.mana_earned`.                                  |
| TV                              | Pass                      | Read-only display now carries a Perpetual badge and oracle/settlement price.                                                              |
| Public API and MCP              | Pass                      | Lite/full shapes expose PERP price/backing without fake liquidity. Generic binary bet APIs reject the mechanism.                          |
| Active native app (`mani`)      | Safe read-only            | Dedicated summary/page and safe feed/profile/notification/ledger rendering. It does not expose a misleading binary bet panel.             |

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
- Closing does not depend on the global `PERPS_ENABLED` flag. This is
  intentional: an incident flag blocks new/increasing exposure while holders
  retain a reduction path.

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

The preflight still fails public mode unless
`--acknowledge-latency-risk` is supplied. That flag records this product
acceptance; it does not claim a mitigation. Expose BTC first, retain the
manifest caps, and inspect realized pool transfers before adding the slower
feeds.

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

Read-only `--phase=feeds` verification at **2026-07-28 05:55 UTC** found
**9 failures and 16 warnings**.

All migration-dependent checks passed:

- all four PERP/oracle tables;
- oracle, one-way-position, participation, idempotency, and accounting-history
  indexes;
- `source_ts`, `published_at`, and `applied_ts`;
- append-only oracle and PERP-event triggers;
- the active-PERP related-market function;
- all four DEV discovery-topic slugs;
- feed freshness and chart-history requirements;
- OpenRouter provider `source_ts` and its contract cache after the 05:50
  scheduler write;
- scheduler heartbeats, cash backing, solvency, funding double-run protection,
  and resolved-position cleanup.

The remaining failures are operational/data gates, not another migration:

1. The unresolved ECI prototype is excluded, lacks the frozen funding period,
   and contains legacy events closer than its correct daily cadence.
2. The legacy BTC prototype lacks `fundingPeriodMs`.
3. The legacy UK-carbon prototype lacks `fundingPeriodMs` and its Science
   topic.
4. The Trump prototype lacks its Politics topic and embedding.
5. The OpenRouter prototype lacks its embedding.

The discovery backfill dry-run found exactly two missing topic states (UK
Science and Trump Politics, absent from both the join and cached slug) and two
missing embeddings (Trump and OpenRouter).
It is deliberately dry-run-only for now: if these prototypes will be settled
and recreated, mutating their topics first only changes ranking timestamps and
does work that will be discarded.

Warnings are all expected prototype/risk review items: legacy 100× leverage,
aggressive funding caps and sensitivity, BTC's loose oracle tolerance,
OpenRouter backing below the manifest recommendation, legacy rows that cannot
prove their original per-side backing, oversized ECI short interest, and the
fact that database checks cannot prove external alert delivery.

The existing DEV prototypes contain open positions (except BTC), so settling
or retiring them is balance-changing and is not part of this read-only audit.
The clean path is to review those balances, settle/retire the legacy set, then
create exactly four new unlisted markets from the manifest. No additional SQL
migration is currently required on DEV.

## Required release sequence

1. On DEV, do not rerun the six installed migrations. Schema, feed history,
   scheduler health, and OpenRouter provider attribution now pass.
2. Review and settle/retire the five legacy prototypes, including ECI, before
   treating DEV as the launch dataset. This step changes user/creator balances
   and therefore needs an explicit human review of the settlement plan.
3. Deploy API, scheduler, and web from the same audited commit. API deployment
   is required for the Explore activity/privacy/cache changes and cleaned ADL
   history; web deployment is required before previewing announcement embeds.
4. Provision required feed secrets and run the four oracle-history backfills
   if the clean replacement markets need them. Never include ECI.
5. Create exactly the four manifest markets through the admin form as
   unlisted. Apply the displayed launch recommendation; this fills the clean
   manifest title as well as the risk settings, and the API automatically
   attaches the required environment-specific topic. The API rejects a launch
   title that differs from the manifest because the `Perpetual` type is
   rendered separately.
6. Run `backfill-perp-launch-discovery.ts` without `--apply`; it must report
   zero missing topics and embeddings for clean markets. Use `--apply` only to
   repair a market that will be retained.
7. Run `perp-launch-preflight.ts --phase=feeds`, then `--phase=unlisted`;
   require zero failures.
8. Verify presence and absence alert policies and deliver a real test incident
   to the on-call channel.
9. On every market, test open, add, flip, full close, duplicate
   idempotency key, stale-feed behavior, and insufficient capacity.
10. Force one liquidation and one ADL on a disposable DEV market and reconcile
    events, balance changes, pools, metrics, and notifications.
11. Resolve a disposable market and verify final price, holder settlement,
    position cleanup, notifications, and cache refresh.
12. Run the period job and reconcile day/week/month P&L across funding, adds,
    flips, liquidation, ADL, and settlement.
13. Run the league updater and confirm `mana_earned_breakdown` has no
    `perp_profit` entry and is unchanged by PERP price moves or settlements.
14. Repeat the signed-in browser pass against the clean unlisted markets and
    deployed DEV API/web, including the final announcement draft.
15. Leave feed and funding schedulers running for at least one hour, rerun
    preflight, and inspect locks, write volume, and CPU.
16. Record the owner and exact caps for the accepted oracle-latency risk, and
    use the acknowledgment flag.
17. Publish one market at a time, starting with BTC. Rerun public preflight and
    inspect rank/impressions/traders before publishing the next.

For PROD, schema-first still applies: install the complete migration set before
deploying writers, then follow the same feeds → unlisted → public phases. A
code deploy alone never installs database objects.

Rollback is operationally simple: set `PERPS_ENABLED = false`, deploy, and
unlist affected markets. This blocks new/increasing exposure while preserving
closes. Restore a valid feed before re-enabling; never fabricate an oracle
point to clear a warning.

## Verification performed at the audited HEAD

- `common`: 23/23 test suites, 336/336 tests.
- TypeScript builds: `common` and `backend/shared`; no-emit typechecks:
  `backend/api`, `backend/scheduler`, and `web`.
- Targeted API/shared/scripts/common/web ESLint and scoped Prettier checks.
- Changed `mani` files pass their filtered strict TypeScript check; the full
  native package still has unrelated pre-existing type failures.
- Live DEV read-only state verification and feed-phase preflight.
- Signed-in local Chrome smoke for full and embedded PERP routes, desktop and
  mobile layouts, Browse/Explore/search, `%` autocomplete, pasted-link mention
  conversion, tabs, chart endpoint/funding-mark accessibility, and horizontal
  overflow.
- Formatting and `git diff --check` on each implementation commit.

Not performed: balance-changing open/add/flip/close/settlement drills on the
legacy public prototypes, or a final announcement preview against the newly
deployed DEV web host. The browser pass used `localhost:3000` with the current
deployed DEV API; an API redeploy is therefore still needed before visually
confirming the new Explore activity rows and aggregate-ADL filtering.

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
- reconciled day/week/month PERP accounting with immutable
  application/publication history and race-safe metric ownership; and
- the executable four-market launch manifest, preflight, operational runbook,
  clean title enforcement, full `Perpetual` title prefixes, and the on-page
  product explainer.

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

The best next session is operational: review retirement of the legacy DEV
prototypes, deploy the final branch, create the clean unlisted four-market set,
and drive the preflight to zero. Treat endogenous price discovery as a
separately specified v2 mechanism only if launch telemetry shows the accepted
oracle-latency subsidy is unacceptable.
