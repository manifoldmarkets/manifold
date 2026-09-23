# PERP launch runbook

This is the operational source of truth for the first public PERP rollout.
`backend/shared/src/perps/launch-manifest.ts` is the executable source of truth
for the intended feeds and their conservative day-one settings: BTC, the four
xStocks tokenized equities, the three VoteHub averages (Trump approval, the
Democratic share of the 2026 generic ballot, JD Vance favorability), the
Alternative.me Crypto Fear & Greed index, and the three OpenRouter token-share
indexes (open-weight, Anthropic, Chinese labs). It is executable on purpose:
run `getPerpLaunchManifestErrors()` rather than trusting a count here, which
has drifted before.

Current DEV state (2026-07-28): all six July PERP follow-up migrations are
installed and their schema/immutability checks pass; do not rerun them. Exactly
seven clean manifest markets are unlisted with zero positions, exact backing,
fresh feeds, required topics, and embeddings. Both `feeds` and `unlisted`
preflights report zero failures. The guarded legacy cleanup retired 27
prototypes and removed 45 derived metrics without changing immutable history or
balances, and its rerun is a verified no-op. The destructive launch drill
completed 148 checks with zero failures and retired every disposable market it
created. DEV API, scheduler, and the `perps-launch` web build are deployed;
`dev.manifold.markets` serves the reviewed embed/card behavior. The only manual
warning is confirmation that a real alert reached the staffed inbox. PROD still
requires the full schema-first migration sequence and human-reviewed rollout.

## The release gate

Run from `backend/scripts` against the intended environment:

```powershell
npx.cmd ts-node perp-launch-preflight.ts --phase=feeds
npx.cmd ts-node perp-launch-preflight.ts --phase=unlisted --allow-warning=external-alert-policies
npx.cmd ts-node perp-launch-preflight.ts --phase=rollout --public-feed=btc-usd --acknowledge-latency-risk --allow-warning=external-alert-policies
npx.cmd ts-node perp-launch-preflight.ts --phase=public --acknowledge-latency-risk --allow-warning=external-alert-policies
```

The phases mean:

- `feeds`: schema, feed history/freshness, and scheduler heartbeats must be
  healthy. Required environment-specific topic slugs must exist. Missing
  markets are warnings; any existing launch market must have its topic and
  embedding.
- `unlisted`: exactly one unresolved market must exist for every launch feed,
  and every one of them must be unlisted.
- `rollout`: one to three explicitly named `--public-feed` markets must be
  public and every other launch market must remain unlisted. Repeat
  `--public-feed` for the cumulative set already exposed.
- `public`: exactly one unresolved public market must exist for every launch
  feed. Any unresolved out-of-manifest PERP fails the gate.

Every `unlisted`, `rollout`, and `public` warning is fail-closed unless its
printed warning key is explicitly passed with `--allow-warning`. A stale
allowance that no longer corresponds to an emitted warning also fails. The only
standing allowance is `external-alert-policies`, because database inspection
cannot prove human inbox delivery. Do not allow economics, capacity, discovery,
feed, or backing warnings.

The rollout and public gates also require an explicit acknowledgment of
oracle-latency arbitrage for every market already exposed:

```powershell
npx.cmd ts-node perp-launch-preflight.ts --phase=public --acknowledge-latency-risk --allow-warning=external-alert-policies
```

That flag is an acknowledgment, not a mitigation. The day-one product decision
is to allow bot competition under the launch manifest's conservative caps.
Record the owner, chosen leverage/backing limits, and observed pool transfers.

## MNX rollout (DEV and PROD)

The sixteen feeds in `MNX_LAUNCH_MARKETS` form an explicit `--cohort=mnx`
rollout in either environment. Default gate commands continue to check the
existing launch cohort; neither cohort requires the other to have created
markets. All unresolved markets in either cohort still undergo token,
escrow, solvency, discovery, oracle and funding checks. Other-cohort markets
are counted in one informational PASS line in every phase; their presence
requires no `--allow-warning` override. Only launch presence and visibility
are scoped; invariant failures in either cohort still block the gate. Unknown
feeds still fail public preflight. `ALL_PERP_LAUNCH_MARKETS` provides title, official-creator, topic, recommendation and manifest-validation
policy for both cohorts. This is a production-capable integration; creation is
enabled in both environments. Deploying it does not create or publicize markets.

No MNX migration is required. The previous draft's `mnx_provider_state` table
and `source_data` column were removed before merge. Price history uses existing
`oracle_prices` columns and provider health uses existing contract JSON. Do not
apply `2026090801_mnx_feeds.sql`. A development database that already applied the
draft may retain its unused additive objects; removal is not a rollout dependency.
All ordinary PERP schema prerequisites elsewhere in this runbook still apply.

Deploy the API **before the scheduler**, then the web client: old API instances
validate quotes with a strict schema and reject the new optional health field.
Drain old API instances before enabling the updated scheduler. The scheduler
uses the existing 2-second `update-oracle-feeds` job; no new job or database
lease is registered. In **both DEV and PROD**, deploy the `main` target first,
then `perps`: `scheduler` must run `SCHEDULER_JOBS=main`, and `scheduler-perps`
must run `SCHEDULER_JOBS=perps`. The deploy scripts reject `all`; it is only a
local-development mode. The perps instance owns all MNX polling, provider-health
updates, price application and hourly funding. Main must have none of those
jobs. See [scheduler deployment](backend/scheduler/README.md#to-deploy).

MNX uses the shared stored ticker system introduced in #4046. New markets
receive their canonical ticker during creation; if any MNX markets predate
that field, inspect `backfill-perp-tickers.ts` and explicitly apply it in the
selected environment. This is an ordinary data repair, not an MNX schema
migration. The preflight requires the stored ticker in either launch cohort.

Rollback should stop the updated scheduler before rolling
back the API. Do not roll back to code without provider-health enforcement while
MNX markets exist: first set `PERP_TRADING_MODE=halted` in the API runtime,
roll and drain all API instances, verify opens **and closes** are rejected,
then stop/roll back the scheduler and API. Keep the halt through rollback.
Unlisting is not a trading halt. An old API ignores provider health and could
otherwise execute a frozen H100 mark for up to its 75-minute price budget.
An old scheduler reports unregistered MNX feeds hourly. Restore health-aware
API, scheduler and web versions and verify freshness before lifting the halt.

### Instruments and price policy

| Feed suffix (`mnx-…-mark`) | MNX ID | Units            | Source maximum age |
| -------------------------- | -----: | ---------------- | ------------------ |
| anthropic                  |     11 | USD billions     | 5 minutes          |
| openai                     |     12 | USD billions     | 5 minutes          |
| deepseek                   |     15 | USD billions     | 5 minutes          |
| moonshot                   |     21 | USD billions     | 5 minutes          |
| h100                       |     19 | USD rental index | 75 minutes         |
| asml                       |     14 | USD              | 5 minutes          |
| crwv                       |      9 | USD              | 5 minutes          |
| dram                       |     17 | USD              | 5 minutes          |
| googl                      |     18 | USD              | 5 minutes          |
| meta                       |     20 | USD              | 5 minutes          |
| minimax                    |     27 | USD              | 5 minutes          |
| mu                         |     22 | USD              | 5 minutes          |
| sndk                       |     25 | USD              | 5 minutes          |
| spcx                       |     10 | USD              | 5 minutes          |
| tsm                        |     26 | USD              | 5 minutes          |
| zai                        |     28 | USD              | 5 minutes          |

The adapter's defined target is MNX's **mark**, not its oracle. MNX describes
marks as a combination of internal-book components, with an oracle fallback
for thin books. Valuation futures have no external valuation anchor and use an
8-hour internal-book EMA for their venue oracle. A mark-versus-oracle clamp or
divergence pause would redefine that target; this integration does neither.
Prices and attribution explicitly identify the MNX derivative. MINIMAX/ZAI
are USD marks for Hong Kong shares, already converted by the provider. H100
is a rental index rather than the GPU purchase price. Existing NVDAx is unchanged.
See [MNX oracle methodology](https://docs.mnx.fi/contracts/oracle-methodology),
[market specifications](https://docs.mnx.fi/contracts/market-specs) and
[API reference](https://docs.mnx.fi/openapi-public.json).

Launch at the manifest's 3× recommendation (or lower if MNX's margin ceiling
requires it), M25,000 per side, funding sensitivity 1 and a nominal annual
funding cap of 1. Funding runs hourly for all sixteen. The normal 10bps web
opening fee and API-effective `max(web, configured API)` fee apply; there is
no fee waiver. Thinness and public marks still permit latency arbitrage even
at a 2s tick, so retain the existing fee and exposure controls. Preflight warns
above the recommendation. Creation rejects leverage above MNX's actual ceiling,
without forcing operators to use the recommended maximum.

One shared request per 2s means approximately 30 requests/minute per scheduler
process, briefly 60 during deployment overlap, plus API and script calls.
Jitter can place two requests about one second apart. No numeric REST quota was
found in MNX's public API reference on 2026-09-09; this is a requested poll
budget, not a claimed provider guarantee. Respect 429/Retry-After up to a ten-minute probe ceiling and watch the
source-age and request-error logs during the unlisted soak. If 30/minute is not
supported, obtain a supported transport or quota before public rollout.

Read-only validation on 2026-09-09 accepted all sixteen live instruments and
returned 767 completed hourly mark candles per instrument, spanning 31.9167
days with a maximum one-hour gap between candle buckets. At that sample the
fifteen non-H100 source ages were about 13–15 seconds; H100 was about 32 minutes.
Twelve subsequent polls at 2-second intervals accepted all sixteen instruments;
HTTP response times were 26–263ms with no request errors. These short samples
do not establish worst-case source ages, overnight behavior or a guaranteed quota.
The feed preflight independently requires at least 30 days and 720 stored points.

Bounds were checked against a public snapshot on 2026-09-10 at 16:17 UTC:
ANTHROPIC 2092, OPENAI 1648, DEEPSEEK 260, MOONSHOT 174 (USD billions);
H100 3.26; ASML 1701.88071296, CRWV 90.25, DRAM 59.04406089, GOOGL 330.8,
META 652.5, MINIMAX 36.35, MU 981, SNDK 1692.87844741, SPCX 152.11117623,
TSM 430.5, ZAI 102.10029835 (USD). Every bound is more than threefold from
that sample. Moonshot's floor is now 1B, allowing sub-10B prices. Bounds reject
gross scaling errors; USD/HKD identity depends on the `price_display` pin,
not on overlapping numerical ranges. This snapshot does not establish a future
price range or weekend behavior. Before public launch, also verify candle
`time` is the bucket start, numeric-field rounding agrees with raw e18 marks,
and every mark change advances `mark_price_timestamp`. The OpenAPI types do
not establish these semantics. Do not infer live timestamp cadence from candles.

### Execute the rollout

Run from `backend/scripts`, with Firebase's active project and
`NEXT_PUBLIC_FIREBASE_ENV` both set to the intended `DEV` or `PROD`. Scripts
refuse mismatched environments. Do DEV end-to-end validation first, then repeat
for PROD. Each script is read-only without `--apply`.

```powershell
npx.cmd ts-node backfill-mnx-oracle.ts
npx.cmd ts-node backfill-mnx-oracle.ts --apply
npx.cmd ts-node publish-mnx-now.ts
npx.cmd ts-node publish-mnx-now.ts --apply
npx.cmd ts-node perp-launch-preflight.ts --cohort=mnx --phase=feeds
npx.cmd ts-node create-mnx-perps.ts
npx.cmd ts-node create-mnx-perps.ts --apply
npx.cmd ts-node create-mnx-perps.ts --creator=mnx            # MNX-owned variant (dry run)
npx.cmd ts-node perp-launch-preflight.ts --cohort=mnx --phase=unlisted --allow-warning=external-alert-policies
```

Backfill refuses any feed already backing an unresolved market, takes the
same publication lock as the tick, and only inserts completed candles before
the earliest existing price and the current validated live source timestamp
(the H100 index can lag the latest completed bucket). Invalid candles fail the
backfill visibly; a zero-row result warns that the available history window
may no longer reach before existing data. It never calls the engine and has no force escape.
The scheduler or `publish-mnx-now.ts --apply` must have published a fresh
point before creation (candles alone are insufficient). `publish-mnx-now`
accepts `--feed=<id>`; `--apply` can also pause existing markets when an
instrument is unavailable. It exits nonzero on unavailable/rejected publication.
Repair discovery prerequisites with
`backfill-perp-launch-discovery.ts --cohort=mnx` (dry run), then `--apply`.
Creation requires `MANIFOLD_API_KEY` belonging to the environment's official
Manifold creator and sufficient backing (M800,000 for all sixteen). By default
the official account owns the markets; `--creator=mnx` makes the verified
`@MNX` partner account the owner instead, in which case that account must hold
the backing (the owner pays it at creation and receives the residual pool at
settlement) while the API key stays the official creator's. The partner's user
id must first be pinned for the environment in `MNX_CREATOR_IDS`
(`backend/shared/src/perps/creator-accounts.ts`); until then the option is
unavailable everywhere. The script refuses to apply against an API that does
not advertise the option and verifies each created market's creator. The
admin form offers the same choice as its **Creator account** selector. It prints
per-instrument readiness and exact request bodies, refuses a partially ready
apply before any creation, and checks duplicates before applying; reruns skip existing
markets. Do not run these commands until ready to perform their indicated writes.

During the unlisted soak, verify opens/closes and balances, price pushes at the
2s cadence on price changes (unchanged health pushes are minute heartbeats), liquidation/ADL, an actual hourly funding event, frozen-source
pause and same-mark recovery, restart recovery, and the alert drill. Confirm
H100 and closed-session equities remain paused when their source validation
fails. A market starts paused until its first successful atomic tick; history
alone cannot make it executable. Observe API freshness and the client banner
agreeing. Rendering and notifications must preserve `$…B` on valuations.

After normal visibility changes, select the same cohort for the progressive
and final public gates:

```powershell
npx.cmd ts-node perp-launch-preflight.ts --cohort=mnx --phase=rollout --public-feed=mnx-anthropic-mark --acknowledge-latency-risk --allow-warning=external-alert-policies
npx.cmd ts-node perp-launch-preflight.ts --cohort=mnx --phase=public --acknowledge-latency-risk --allow-warning=external-alert-policies
```

No database writes, market creation, deployments or DEV/PROD trading drills
were performed as part of the code revision. Those are rollout steps, separate
from passing the code tests and live-provider read checks.

## Why oracle latency is still a launch decision

PERPs currently open and close at the cached oracle price with no spread or
fee. A trader can observe a public source before Manifold ingests it, trade
against the old cached value, and exit after the update. Funding does not
protect the pools when the trader is flat at the funding timestamp.

| Feed                           | Day-one game design                             | Execution risk                                                                               |
| ------------------------------ | ----------------------------------------------- | -------------------------------------------------------------------------------------------- |
| BTC/USD                        | Best fit: continuous and genuinely two-sided    | Exchange prices can lead the 5-second poll                                                   |
| xStocks (SPYx/QQQx/GLDx/NVDAx) | Equity/commodity exposure, two-sided            | Pools can lead the 2-second poll; liquidity far thinner than BTC                             |
| Trump approval                 | Coherent politics theses, but slow              | Public daily step plus known scheduler timing                                                |
| VoteHub generic ballot / Vance | Same shape as Trump approval; Vance is thinner  | Same 5-minute poll against VoteHub's max-age=300 cache; fewer, larger steps for Vance        |
| Crypto Fear & Greed            | Mean-reverting sentiment gauge, two-sided       | New daily value is public at ~00:00 UTC; exposure bounded by the 5-minute poll               |
| OpenRouter open-weight share   | Two-sided index with coherent adoption theses   | Upstream exposes complete UTC days, so hourly writes usually repeat a predictable daily step |
| OpenRouter Anthropic / CN labs | Two-sided proxies for third-party-routed demand | Same payload and same daily step as the open-weight share                                    |

### xStocks on-chain sources (ongoing, post-launch)

Each xStocks feed reads its token's two or three deepest USDC pools straight
from Solana account state (`XSTOCK_SPECS[...].pools`, decoded in
`common/src/perps/solana-pools.ts`). Nothing else: Jupiter, MEXC and Gate
were all removed on 2026-08-27 because each came with terms (rate-limited
licence; commercial-use and automated-access prohibitions). The pool set is
PINNED by address on purpose — an oracle must not follow liquidity to whatever
pool an aggregator happens to list — so it can go stale when liquidity
migrates. Re-probe after any issuer or venue announcement, and whenever a
feed starts logging `no venue pair agreed` more than a few times a day:

```powershell
# every pool for a mint, with liquidity and 24h volume
curl.exe -s https://api.dexscreener.com/token-pairs/v1/solana/<MINT>
```

Add a pool that is deeper than one listed; drop one whose liquidity has left.
The reader fails closed (NaN, source skipped) on a wrong program owner, a
wrong pair, a Raydium pool whose stored decimals disagree with the spec, zero
in-range liquidity, or a sqrt-price/tick pair that cannot both be right — so
a stale or mistyped address costs a vote, never a wrong price.

RPC endpoints come from `SOLANA_RPC_URLS` (comma-separated, tried in order);
the public mainnet node is always the final fallback. One batched call per
tick is inside the public node's limits, but it is documented as not for
production, so put a keyed provider first once one exists.

The Token-2022 dividend multiplier no longer needs watching for feed
correctness: every pool trades the raw token, so every source is in the same
unit. The raw token drifting above the ETF by accrued dividends is the
instrument's economics, not a feed error.

Two consequences of being chain-only, both accepted: the feeds are
denominated in USDC (a USDC depeg would move all four together), and
`backend/scripts/backfill-xstocks-oracle.ts` still seeds history from Gate
candles — re-point or retire it before it is run again.

Do not treat more frequent identical timestamps, larger pools, or a higher
funding cap as fixes. Durable options are trade-time source refresh, a
spread/fee that prices oracle latency, or a different execution mechanism.

An endogenous AMM/order-book quote with later oracle settlement is a coherent
future mechanism and would reward early information by moving the price. It is
not a local fix: it requires basis/convergence rules, mark-versus-index
liquidations, manipulation controls, and an explicit liquidity provider. Bots
would arbitrage that quote toward the expected oracle rather than disappear.
Keep that redesign separate from the capped day-one launch.

## Before creating markets

1. For a new environment (including PROD), keep PERPs disabled and pause their
   scheduler jobs while applying the complete PERP migration set. Compare the
   migration ledger first and apply only unapplied files, in this order:

   - `2026042201_add_perps.sql`
   - `2026072801_include_perps_in_related_market_embeddings.sql`
   - `2026072802_perp_participation_events_ts_idx.sql`
   - `2026072803_make_oracle_prices_append_only.sql`
   - `2026072804_perp_trade_idempotency.sql`
   - `2026072805_add_oracle_source_time.sql`
   - `2026072806_perp_accounting_history.sql`

   `2026072802` uses `create index concurrently`; run it outside any
   encompassing transaction. Deploying code does not create database objects.
   DEV already had the April base and has completed all six July follow-ups.

2. Deploy API and scheduler from the same audited commit, then resume the
   scheduler. Configure the API runtime with `PERP_TRADING_MODE=enabled` and
   verify OpenRouter writes a point with provider `source_ts`.
3. Provision `OPENROUTER_API_KEY` in the target environment.
4. Run the oracle backfills for any launch feed whose history is absent: BTC,
   xStocks, Trump (`backfill-trump-approval-oracle`), the other VoteHub feeds
   (`backfill-votehub-oracle --feed=<feedId>`, after confirming the spec's
   average and answer keys with `list-votehub-averages`), Fear & Greed
   (`backfill-fear-greed-oracle`), and each OpenRouter index
   (`backfill-openrouter-oracle [--feed=<feedId>]`). Backfills are for feeds
   with no live market only. (The UK carbon feed and its backfill script were
   removed when that market was sunset on 2026-08-10.)
   Before creating a market on `crypto-fear-greed`, read the terms section of
   https://alternative.me/crypto/fear-and-greed-index/ and record it in
   `common/src/perps/oracle-attribution.ts`; the entry says why.
   Before the Chinese-lab backfill, open `/admin/model-classifications` and
   clear every ranked lab-classification row. The audited seed covers the
   launch history; future authors/models are discovered into this DB-backed
   queue. If the zero-tolerance backfill finds a delisted historical subject,
   it aborts without inserts, adds that subject to the same queue, and succeeds
   after the verdict is recorded and the script is rerun.
5. Review and settle/retire out-of-manifest or legacy prototypes. This changes
   balances; record the intended final oracle point and affected positions
   before executing it.
6. Run `--phase=feeds`; zero failures are required before creation and every
   warning must be understood.
7. Verify GCP alert policies and deliver a test incident:
   - ERROR presence for `[oracle-feeds]`, `[update-perps]`, `[openrouter]`,
     `[trump-approval]`, `[votehub]`, `[fear-greed]`, and scheduler
     `Error during job execution`.
   - Absence/dead-man alerts for `update-oracle-feeds` within two minutes and
     `update-perps` within two hours.
   - Route both policies to a channel with a real on-call owner.
8. Hold the final web deploy until the hidden dataset and backend preflight are
   ready. Deploy the reviewed web commit immediately before hidden browser and
   announcement QA; generated iframe URLs must target that deployed
   environment, not localhost.

Sign in as the environment's official Manifold account; both the form and API
reject any other admin, because the selected creator account's balance is
spent. The **Creator account** selector defaults to the official account and
offers `@MNX` on MNX feeds only; whichever is selected pays the backing and
receives the residual at settlement. Confirm that account has at least
M100,000 available before creation. The form defaults to unlisted. For each
manifest feed, click
**Apply launch recommendation**; it sets leverage, annual funding cap,
sensitivity, oracle-age tolerance, per-side backing, and unlisted visibility.
The API automatically attaches the required DEV/PROD topic atomically.
Additional topics remain optional.

Discovery repair is dry-run by default:

```powershell
npx.cmd ts-node backfill-perp-launch-discovery.ts
npx.cmd ts-node backfill-perp-launch-discovery.ts --apply
```

Run the first command after creation. A clean set reports zero missing topic
links and embeddings. Use `--apply` only for prototypes that will be retained;
topic attachment updates market ranking time, so do not mutate a market that
will immediately be recreated.

Markets created before the stored ticker existed need it stamped, or search
cannot find them by ticker and the preflight fails their launch-ticker check:

```powershell
npx.cmd ts-node backfill-perp-tickers.ts
npx.cmd ts-node backfill-perp-tickers.ts --apply
```

It writes only `ticker` (no ranking-time bump), settled markets included, and
leaves any market on a feed missing from `PERP_FEED_TICKERS` alone.

## Unlisted smoke pass

Create only the manifest feeds as unlisted. Required topic tags are
automatic. Then:

1. Run the discovery backfill in dry-run mode, then:

   ```powershell
   npx.cmd ts-node perp-launch-preflight.ts --phase=unlisted --allow-warning=external-alert-policies
   ```

   Both must report no missing launch-discovery requirements. The preflight
   must have zero failures and exactly that one reviewed warning.

2. Deploy the final reviewed web commit and verify the deployed SHA and
   environment. Keep every market unlisted.
3. With deliberately minimal M$ amounts, open long, add, flip, fully close, and
   retry the same request idempotency key on every market. Avoid materially
   inflating their initial ranking volume. Partial close is not implemented in
   the v1 endpoint/UI.
4. Force one liquidation and one ADL on dev; verify event, balance, pool,
   user metric, and notification rows.
5. Resolve a disposable market; verify holder notifications, final price,
   remaining-pool payout, cache refresh, and that no position row remains.
6. Run the period-metric job after an add, funding event, flip, liquidation,
   ADL, and resolution; reconcile `from.day`/`from.week` with the event cash
   flows and confirm automated transitions did not change `lastBetTime`.
7. Run the league updater and confirm PERP gains/losses do not change
   `leagues.mana_earned` and do not create a `perp_profit` breakdown entry.
8. In a signed-in browser, confirm search, topic pages, browse, Explore
   activity, related markets, `%[market]`, pasted-link mentions, and
   `/embed/...` all render the PERP price/type/backing correctly on desktop and
   mobile. Preview the actual launch announcement draft against deployed DEV.
9. Leave the fast tick and hourly funding job running for at least one hour,
   then rerun the preflight and inspect scheduler CPU, lock contention, and
   contract write volume.
10. Stop a dev feed and verify both opens and closes pause at the same freshness
    boundary, the page explains why, and an alert arrives.

## Public rollout and rollback

Flip one market public at a time and run `--phase=rollout` with the cumulative
set of public feed IDs. Start with BTC:

```powershell
npx.cmd ts-node perp-launch-preflight.ts --phase=rollout --public-feed=btc-usd --acknowledge-latency-risk --allow-warning=external-alert-policies
```

Before each next flip, inspect Browse/Explore rank, impressions, pool movement,
and unique/repeat traders. Add another `--public-feed=<id>` for each market
already exposed. After every market is public, switch to the final
`--phase=public` command; the rollout phase deliberately rejects a full set.
The final gate must emit one acknowledged latency warning per launch feed and
the one explicitly allowed external-alert warning. Counts here are deliberately
not written out: `getPerpLaunchManifestErrors()` is the executable source, and
these numbers have drifted twice already.

For an incident:

1. Change the API runtime mode and roll its instances:

   - `PERP_TRADING_MODE=reduce-only` blocks creation, opens, adds, and flips but
     preserves ordinary closes.
   - `PERP_TRADING_MODE=halted` blocks both exposure increases and user closes.

   The compiled `PERPS_ENABLED=false` switch cannot be overridden by runtime
   `enabled`; it remains at least `reduce-only`. An invalid runtime value fails
   closed as `halted`. Keep scheduler liquidation, funding, and resolution jobs
   running in either incident mode.

2. Unlist affected markets.
3. If the oracle is merely stale, restore it and let users close. Do not publish
   an invented point to make the warning disappear. The slow feeds have manual
   escape hatches that publish the source's CURRENT value stamped now
   (`publish-trump-approval-now`, `publish-votehub-now --feed=<feedId>`,
   `publish-fear-greed-now`, each with `--force` to bypass the unchanged gate);
   they never backdate.
4. If a still-fresh cached point is known corrupt, use `halted` before
   investigating; unlisting alone does not block a direct API close. Preserve
   immutable history and resolve only against a validated published point.
5. Rerun the preflight before re-enabling opens.
