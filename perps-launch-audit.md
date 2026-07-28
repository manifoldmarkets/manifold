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

| Area                             | Status                | Meaning                                                                                                                                                           |
| -------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core math, accounting, lifecycle | Pass in code/tests    | Backing, solvency, funding, liquidation/ADL, settlement, and idempotency have explicit guards and tests.                                                          |
| Web integration                  | Pass in code/SSR      | Market page, cards, browse, explore, search, related markets, embeds, mentions, dashboards, profile, TV, SEO/OG, and notifications understand PERPs.              |
| Native safety                    | Pass, read-only       | Current native clients no longer treat PERPs as binary or crash; they show a safe summary and link through. Native trading is not implemented.                    |
| Automated verification           | Pass                  | 21 common test suites / 328 tests and TypeScript builds for common, backend shared, API, scheduler, and web pass at the audited HEAD.                             |
| DEV release preflight            | **Fail**              | The 2026-07-27 18:34 UTC run found 13 failures and 12 warnings, primarily unapplied migrations and legacy DEV market configuration.                               |
| Oracle-latency exposure          | Accepted launch risk  | Exact, zero-fee execution at a cached public oracle is pick-offable. Launch accepts bot competition under the manifest caps and monitors pool transfer.           |
| Signed-in visual smoke           | **Open release gate** | Live SSR/API routes passed, but no browser runtime was available for the final responsive and `%[market]` interaction pass.                                       |
| Period-specific PERP P&L         | Pass in code/tests    | Day/week/month values reverse the append-only position history from one consistent database snapshot, including funding, flips, liquidation, ADL, and settlement. |

Do not turn the four markets public merely because the branch builds. First
apply the migrations, obtain a zero-failure preflight, run the unlisted smoke
pass, and invoke the public preflight with the explicit cached-oracle risk
acknowledgment and recorded day-one caps.

## Direct answers to the launch questions

### Embeds and `%[perp market]` mentions

Implemented.

- The external `/embed/[username]/[contractSlug]` route identifies the market
  as a perpetual, displays the oracle price rather than a probability, renders
  a PERP sparkline, and preserves oracle-source attribution.
- The rich-text `%` market picker receives `oraclePrice` in the lite market
  payload, labels PERPs in its suggestions, and shows the formatted oracle
  price.
- A persisted `%[market]` mention renders through the PERP-aware
  `ContractMention` component, so the launch announcement can reference these
  markets inline.
- Related-market cards, compact rows, activity cards, and link previews also
  identify the type and do not present a fake binary probability.

Live DEV SSR returned HTTP 200 for both the full and embedded BTC and
OpenRouter market routes, including the PERP label, current price, and source
metadata. A final signed-in editor interaction remains in the unlisted smoke
check because the browser runtime was unavailable during this audit.

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
Public PERPs are therefore eligible. Topic tags and creation-time embeddings
make them eligible for topic and related-market discovery after the related
embedding migration is applied. Unlisted markets are intentionally absent
from public Browse/Explore until the public rollout.

This design is sane, but relative calibration cannot be proven from four DEV
markets. The runbook therefore exposes one market at a time and requires an
observed rank check before exposing the next. Post-launch telemetry should
compare PERP impressions, clicks, unique traders, and repeat traders with the
ordinary market distribution; tune shared score weights only from that data.

### Browse identity and the misleading `0 liquidity`

Implemented.

- Cards and tables carry a visible `Perp`/`Perpetual` badge.
- The main value is the formatted oracle price, not `0%` or a binary chance.
- Feed cards can show a price sparkline.
- The backing row uses `poolLong + poolShort` as market backing.
- API/MCP lite market payloads expose `oraclePrice` and `backingPool`
  explicitly rather than inventing an AMM liquidity tier.
- Browse liquidity/elasticity ordering no longer treats a missing CPMM
  liquidity field as a meaningful zero.

"Backing" is the correct label. The two pools are cash backing for the
parimutuel liabilities; calling that ordinary CPMM liquidity would imply the
wrong mechanism.

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
| Browse/search tables            | Pass                      | Badge, oracle price, backing-aware display/sorts, no fake probability.                                                                    |
| Home/Explore feed               | Pass                      | Eligible as an ordinary public market; PERP trades feed importance and participation.                                                     |
| Activity/feed cards             | Pass                      | Badge, price, sparkline, backing, safe action rows.                                                                                       |
| Topic and related markets       | Pass after migration      | Creation honors `groupIds` and generates embeddings; the migration includes active no-close PERPs in related results.                     |
| `%` rich-text mentions          | Pass in code              | Picker and rendered mention are PERP-aware; final signed-in interaction is a release smoke item.                                          |
| External embed                  | Pass in code and live SSR | Badge, price, sparkline, attribution.                                                                                                     |
| SEO/Open Graph                  | Pass                      | PERP title/price semantics; no binary probability claim.                                                                                  |
| Dashboard cards                 | Pass                      | Shows direction, current position value, and lifetime profit.                                                                             |
| Profile/portfolio current state | Pass                      | Synthetic contract metrics include position value, funding-inclusive realized payouts, direction, and lifetime P&L.                       |
| Position reduction              | Deliberate v1 limitation  | Users can add, fully close, or atomically flip; there is no partial-close control or endpoint yet.                                        |
| Daily/weekly per-contract P&L   | Pass in code/tests        | Reconciled event replay includes funding, new margin, flips, exits, liquidation, ADL, and settlement; see the dedicated section below.    |
| Notifications and balance log   | Pass                      | Liquidation, ADL, trade, funding, and settlement rows are type-safe and readable.                                                         |
| Email market values             | Pass                      | PERPs format oracle/settlement price, and weekly mover selection reads the replayed weekly P&L.                                           |
| TV                              | Pass                      | Read-only display now carries a Perpetual badge and oracle/settlement price.                                                              |
| Public API and MCP              | Pass                      | Lite/full shapes expose PERP price/backing without fake liquidity. Generic binary bet APIs reject the mechanism.                          |
| Active native app (`mani`)      | Safe read-only            | Dedicated summary/page and safe feed/profile/notification/ledger rendering. It does not expose a misleading binary bet panel.             |

## Accounting, risk, and lifecycle audit

### Creation and authorization

- PERP creation is admin-only and registry-gated.
- The endpoint validates feed price bounds, oracle-age configuration, finite
  numeric inputs, topic IDs, and initial backing.
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

Malformed or incomplete history fails closed and leaves the prior period block
unchanged rather than publishing a fabricated zero. The launch migrations and
clean market recreation are required because legacy DEV rows can only
backfill application/publication time approximately.

## Latest DEV evidence

Read-only verification at **2026-07-27 18:34 UTC** found:

- BTC: price about 64,779; pools about M$1,019,458 long /
  M$304,847 short; feed current with 227 rows in the prior hour.
- UK carbon: price 143; pools about M$60,144 / M$98,598; latest finalized
  point about 34 minutes old.
- Trump approval replacement: price about 38.944; pools about M$5,010 /
  M$5,000; daily source about 11.6 hours old.
- OpenRouter share: price about 74.036; pools about M$7,499 / M$5,001;
  latest ingest about 44 minutes old.
- Funding double-run check passed: no contract had more than one event in an
  hour.
- Real liquidation and ADL rows and their notification rows exist, including
  a recent UK carbon liquidation and disposable scratch-drill cases.
- No resolved market retained an open position.

The same DEV `--phase=feeds` preflight reported **13 failures and 12 warnings**.
That run predates the new accounting-history checks, which will also fail until
the latest migration is installed. The recorded failures are expected
blockers, not ignorable test noise:

1. missing participation index;
2. missing open idempotency index;
3. missing close idempotency index;
4. missing oracle `source_ts` column;
5. missing immutable-oracle trigger;
6. missing PERP related-market embedding function;
7. feed inspection consequently failing on absent `source_ts`;
8. unresolved excluded ECI market;
9. missing funding period on the legacy ECI market;
10. invalid legacy ECI funding cadence;
11. OpenRouter contract attribution trailing because source metadata is not
    deployed;
12. missing funding period on legacy UK carbon; and
13. missing funding period on legacy BTC.

Warnings include 100x legacy leverage, aggressive funding caps, insufficient
OpenRouter initial backing, BTC oracle tolerance, oversized legacy open
interest, and the fact that database checks cannot prove external GCP alert
delivery.

This is useful DEV history, but it is not a launch pass. Apply migrations and
create clean unlisted markets from the manifest rather than normalizing the
legacy prototypes into the production dataset.

## Required release sequence

1. Keep PERPs disabled and pause the PERP scheduler jobs during the schema
   change.
2. Apply every PERP migration, including participation/idempotency indexes,
   immutable accounting/publication timestamps, and related-market
   embeddings. "Apply" means execute the committed SQL files against the
   target Supabase/Postgres database; merging or deploying application code
   does not alter an existing database schema.
3. Deploy API and scheduler from the same audited commit, then resume the
   scheduler. The new code requires the added columns, while the old code
   tolerates them, so the migration must land first.
4. Provision the required feed secrets and run the four launch backfills.
5. Run `perp-launch-preflight.ts --phase=feeds`; require zero failures.
6. Verify presence and absence alert policies and deliver a real test incident
   to the on-call channel.
7. Create exactly the four manifest markets as unlisted with conservative
   settings and topic tags. Do not create ECI.
8. Run `--phase=unlisted`.
9. On every market, test open, add, flip, full close, duplicate
   idempotency key, stale-feed behavior, and insufficient capacity.
10. Force one liquidation and one ADL on a disposable DEV market and reconcile
    events, balance changes, pools, metrics, and notifications.
11. Resolve a disposable market and verify final price, holder settlement,
    position cleanup, notifications, and cache refresh.
12. Run the period job and reconcile day/week/month P&L across funding, adds,
    flips, liquidation, ADL, and settlement.
13. In a connected signed-in browser, verify desktop/mobile market pages,
    Browse, Explore, topic/related results, `%[market]`, external embeds,
    dashboard/profile, dark mode, keyboard/tap behavior, and stale UI.
14. Leave feed and funding schedulers running for at least one hour, rerun
    preflight, and inspect locks, write volume, and CPU.
15. Record the owner and exact caps for the accepted oracle-latency risk, and
    use the acknowledgment flag.
16. Publish one market at a time, starting with BTC. Rerun public preflight and
    inspect rank/impressions/traders before publishing the next.

Rollback is operationally simple: set `PERPS_ENABLED = false`, deploy, and
unlist affected markets. This blocks new/increasing exposure while preserving
closes. Restore a valid feed before re-enabling; never fabricate an oracle
point to clear a warning.

## Verification performed at the audited HEAD

- `common`: 21/21 test suites, 328/328 tests.
- TypeScript project builds: `common`, `backend/shared`, `backend/api`,
  `backend/scheduler`, and `web`.
- Changed `mani` files pass their filtered strict TypeScript check; the full
  native package still has unrelated pre-existing type failures.
- Live DEV read-only state verification and feed-phase preflight.
- Live local SSR smoke for full and external-embed BTC and OpenRouter routes.
- Formatting and `git diff --check` on each implementation commit.

Not performed: a connected, signed-in interactive browser pass. The browser
tools are supported by Codex, but this Windows installation exposed neither a
usable built-in browser nor the Chrome extension/native host bridge. Install
and enable the Chrome plugin/extension (or open the built-in Browser plugin) in
the ChatGPT desktop app, start a fresh Codex chat, and then run the responsive
and editor-interaction pass. This audit does not claim that visual approval.

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
- reconciled day/week/month PERP accounting with immutable
  application/publication history and race-safe metric ownership; and
- the executable four-market launch manifest, preflight, and operational
  runbook.

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

The best next session is operational: apply migrations in a disposable
environment and drive the preflight to zero. After that, use a short connected
browser-QA session for the unlisted-to-public gate. Treat endogenous
price-discovery as a separately specified v2 mechanism only if launch
telemetry shows the accepted oracle-latency subsidy is unacceptable.
