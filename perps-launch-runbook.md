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

Sign in as the environment's official Manifold account; residual backing
returns to the creator at settlement, and both the form and API reject another
admin for launch feeds. Confirm that account has at least M100,000 available
before creation. The form defaults to unlisted. For each manifest feed, click
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
   an invented point to make the warning disappear.
4. If a still-fresh cached point is known corrupt, use `halted` before
   investigating; unlisting alone does not block a direct API close. Preserve
   immutable history and resolve only against a validated published point.
5. Rerun the preflight before re-enabling opens.
