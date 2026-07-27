# PERP launch integration audit

Status: 2026-07-28  
Branch: `perps-launch`  
Operational source of truth: `perps-launch-runbook.md`  
Executable launch definition: `backend/shared/src/perps/launch-manifest.ts`

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

| Area                             | Status                    | Meaning                                                                                                                                              |
| -------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core math, accounting, lifecycle | Pass in code/tests        | Backing, solvency, funding, liquidation/ADL, settlement, and idempotency have explicit guards and tests.                                             |
| Web integration                  | Pass in code/SSR          | Market page, cards, browse, explore, search, related markets, embeds, mentions, dashboards, profile, TV, SEO/OG, and notifications understand PERPs. |
| Native safety                    | Pass, read-only           | Current native clients no longer treat PERPs as binary or crash; they show a safe summary and link through. Native trading is not implemented.       |
| Automated verification           | Pass                      | 20 common test suites / 314 tests and TypeScript builds for common, backend shared, API, scheduler, and web pass at the audited HEAD.                |
| DEV release preflight            | **Fail**                  | The 2026-07-27 18:34 UTC run found 13 failures and 12 warnings, primarily unapplied migrations and legacy DEV market configuration.                  |
| Oracle-latency exposure          | **Open product decision** | Exact, zero-fee execution at a cached public oracle is pick-offable. Funding does not remove this risk.                                              |
| Signed-in visual smoke           | **Open release gate**     | Live SSR/API routes passed, but no browser runtime was available for the final responsive and `%[market]` interaction pass.                          |
| Period-specific PERP P&L         | Known limitation          | Current value and lifetime P&L work; per-contract day/week/month deltas are not yet historized and weekly/daily mover reports can omit PERPs.        |

Do not turn the four markets public merely because the branch builds. First
apply the migrations, obtain a zero-failure preflight, run the unlisted smoke
pass, and either mitigate or explicitly accept the cached-oracle execution
risk.

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
| Daily/weekly per-contract P&L   | Limitation                | `ContractMetric.from` is not historized for PERPs; see the dedicated section below.                                                       |
| Notifications and balance log   | Pass                      | Liquidation, ADL, trade, funding, and settlement rows are type-safe and readable.                                                         |
| Email market values             | Pass                      | PERPs format oracle/settlement price; weekly mover selection has the period-P&L limitation.                                               |
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

- Oracle history is append-only after the migration.
- Source observation time is separate from Manifold ingestion time, so
  attribution does not falsely claim a repeated value is newly observed.
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

## The largest unresolved risk: cached-oracle latency arbitrage

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
The durable choices are:

1. refresh and validate the source at trade time, with explicit outage/fallback
   behavior;
2. charge a spread/fee large enough to cover the source-to-cache latency
   window;
3. use a discrete execution/cutoff mechanism for slow public-step feeds; or
4. accept the risk temporarily, with the manifest's low leverage/backing
   limits and a named owner.

The preflight treats this as a public-launch failure. The
`--acknowledge-latency-risk` flag only records acceptance; it is not a
mitigation. My recommendation is to make the mechanism choice before public
exposure. If launch timing requires temporary acceptance, expose BTC first,
use the manifest caps, monitor realized pool transfers, and do not describe
the acknowledgment as a technical fix.

## Known analytics limitation: period-specific PERP P&L

Current portfolio value and lifetime profit are correct. Aggregate portfolio
history includes PERP value. The missing piece is a per-contract historical
baseline:

- synthetic PERP metrics currently write `from: undefined`;
- the generic period updater discovers ordinary activity from bets,
  resolutions, and answers, not enough PERP state to recreate funding and
  position changes;
- daily changed-market selection reads `from.day`; and
- weekly portfolio email movers read `from.week`.

Therefore a PERP can be omitted or appear as zero in those per-contract
day/week reports even though its current and lifetime values are correct. This
does not alter balances, pool accounting, liquidation, or settlement.

Do not patch this with `current price - old price`. That would be wrong after
adds, partial closes, flips, funding, liquidation, or ADL. The robust follow-up
is an as-of metric history: store per-user post-state snapshots at relevant
events/funding boundaries (or an equivalently complete replayable history),
then derive day/week/month deltas from the last snapshot at each boundary.
Build and test that as a separate financial-accounting workstream.

Until then, either accept that PERPs are absent from per-contract weekly mover
copy or explicitly suppress them there. Do not imply that a displayed zero is
the user's actual period return.

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
The failures are expected blockers, not ignorable test noise:

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

1. Deploy API and scheduler from the same audited commit.
2. Apply every PERP migration, including participation/idempotency indexes,
   append-only oracle metadata, and related-market embeddings.
3. Provision the required feed secrets and run the four launch backfills.
4. Run `perp-launch-preflight.ts --phase=feeds`; require zero failures.
5. Verify presence and absence alert policies and deliver a real test incident
   to the on-call channel.
6. Create exactly the four manifest markets as unlisted with conservative
   settings and topic tags. Do not create ECI.
7. Run `--phase=unlisted`.
8. On every market, test open, add, flip, partial/full close, duplicate
   idempotency key, stale-feed behavior, and insufficient capacity.
9. Force one liquidation and one ADL on a disposable DEV market and reconcile
   events, balance changes, pools, metrics, and notifications.
10. Resolve a disposable market and verify final price, holder settlement,
    position cleanup, notifications, and cache refresh.
11. In a connected signed-in browser, verify desktop/mobile market pages,
    Browse, Explore, topic/related results, `%[market]`, external embeds,
    dashboard/profile, dark mode, keyboard/tap behavior, and stale UI.
12. Leave feed and funding schedulers running for at least one hour, rerun
    preflight, and inspect locks, write volume, and CPU.
13. Close the oracle-latency decision. If explicitly accepting it, record the
    owner and exact caps and use the acknowledgment flag.
14. Publish one market at a time, starting with BTC. Rerun public preflight and
    inspect rank/impressions/traders before publishing the next.

Rollback is operationally simple: set `PERPS_ENABLED = false`, deploy, and
unlist affected markets. This blocks new/increasing exposure while preserving
closes. Restore a valid feed before re-enabling; never fabricate an oracle
point to clear a warning.

## Verification performed at the audited HEAD

- `common`: 20/20 test suites, 314/314 tests.
- TypeScript project builds: `common`, `backend/shared`, `backend/api`,
  `backend/scheduler`, and `web`.
- Changed `mani` files pass their filtered strict TypeScript check; the full
  native package still has unrelated pre-existing type failures.
- Live DEV read-only state verification and feed-phase preflight.
- Live local SSR smoke for full and external-embed BTC and OpenRouter routes.
- Formatting and `git diff --check` on each implementation commit.

Not performed: a connected, signed-in interactive browser pass. The browser
runtime exposed no usable browser instance, so this audit does not claim
responsive visual or editor-interaction approval.

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
  and
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
   - oracle execution/financial accounting;
   - database migration and operational rollout;
   - signed-in web visual QA and ranking telemetry; and
   - period-metric history/native trading follow-ups.
4. Keep tightly coupled mechanism changes in one session. A spread, fee,
   trade-time refresh, funding, or ADL change crosses `common`, backend, and UI
   and should be reviewed and tested as one financial unit.
5. Continue one-purpose commits and push each verified checkpoint. A later
   session can recover context from the audit plus `git log` without replaying
   this conversation.
6. Use a new session after a clear milestone if the current context becomes
   noisy. Do not create several independent branches that redesign the same
   engine concurrently.

The best next session is not another broad review. It is a focused
cached-oracle execution decision and implementation plan. In parallel, an ops
session can apply migrations to a disposable environment and drive the
preflight to zero. After those, use a short browser-QA session for the
unlisted-to-public gate.
