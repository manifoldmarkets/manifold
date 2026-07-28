# PERP launch runbook

This is the operational source of truth for the first public PERP rollout.
`perps-launch-audit.md` is the companion integration review and current
go/no-go status.
`backend/shared/src/perps/launch-manifest.ts` is the executable source of truth
for the four intended feeds and their conservative day-one settings. ECI is
explicitly excluded in both places.

Current DEV state (2026-07-28): all six July PERP migrations are installed and
their schema/immutability checks pass. OpenRouter's first post-deploy
`source_ts` write also passes. Do not rerun the migrations. The remaining DEV
failures belong to legacy prototypes and missing prototype topics/embeddings;
external alert delivery remains a manual warning. PROD still requires the full
schema-first migration sequence.

## The release gate

Run from `backend/scripts` against the intended environment:

```powershell
npx.cmd ts-node perp-launch-preflight.ts --phase=feeds
npx.cmd ts-node perp-launch-preflight.ts --phase=unlisted
npx.cmd ts-node perp-launch-preflight.ts --phase=public
```

The phases mean:

- `feeds`: schema, feed history/freshness, and scheduler heartbeats must be
  healthy. Required environment-specific topic slugs must exist. Missing
  markets are warnings; any existing launch market must have its topic and
  embedding.
- `unlisted`: exactly one unresolved market must exist for every launch feed,
  and all four must be unlisted.
- `public`: exactly one unresolved public market must exist for every launch
  feed. Any unresolved ECI or out-of-manifest PERP fails the gate.

The public gate intentionally requires an explicit acknowledgment of
oracle-latency arbitrage:

```powershell
npx.cmd ts-node perp-launch-preflight.ts --phase=public --acknowledge-latency-risk
```

That flag is an acknowledgment, not a mitigation. The day-one product decision
is to allow bot competition under the launch manifest's conservative caps.
Record the owner, chosen leverage/backing limits, and observed pool transfers.

## Why oracle latency is still a launch decision

PERPs currently open and close at the cached oracle price with no spread or
fee. A trader can observe a public source before Manifold ingests it, trade
against the old cached value, and exit after the update. Funding does not
protect the pools when the trader is flat at the funding timestamp.

| Feed                         | Day-one game design                          | Execution risk                                                                               |
| ---------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| BTC/USD                      | Best fit: continuous and genuinely two-sided | Exchange prices can lead the 15-second poll                                                  |
| UK grid carbon               | Two-sided and mean-reverting                 | Finalized batches and forecasts can lead ingestion                                           |
| Trump approval               | Coherent politics theses, but slow           | Public daily step plus known scheduler timing                                                |
| OpenRouter open-weight share | Two-sided index; preferable to ECI           | Upstream exposes complete UTC days, so hourly writes usually repeat a predictable daily step |
| ECI frontier                 | Not a market                                 | Monotone running maximum creates a dominant long strategy                                    |

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
   scheduler jobs while applying the complete PERP migration set. Deploying
   code does not create tables, columns, indexes, functions, or triggers.
   DEV has already completed this step.
2. Deploy API and scheduler from the same audited commit, then resume the
   scheduler. Verify OpenRouter writes a point with provider `source_ts`.
3. Deploy the web from that commit before previewing announcement embeds; the
   iframe generator points at the deployed environment rather than localhost.
4. Provision `OPENROUTER_API_KEY` in the target environment.
5. Run the BTC, UK carbon, Trump, and OpenRouter oracle backfills if history is
   absent. Never run ECI as part of the launch batch.
6. Review and settle/retire out-of-manifest or legacy prototypes. This changes
   balances; record the intended final oracle point and affected positions
   before executing it.
7. Run `--phase=feeds`; zero failures are required before creation.
8. Verify GCP alert policies and deliver a test incident:
   - ERROR presence for `[oracle-feeds]`, `[update-perps]`, `[openrouter]`,
     `[trump-approval]`, and scheduler `Error during job execution`.
   - Absence/dead-man alerts for `update-oracle-feeds` within two minutes and
     `update-perps` within two hours.
   - Route both policies to a channel with a real on-call owner.

Sign in as the environment's official Manifold account; residual backing
returns to the creator at settlement, and both the form and API reject another
admin for launch feeds. The form defaults to unlisted. For each manifest feed,
click **Apply launch recommendation**; it sets leverage, annual funding cap,
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

Create only the four manifest feeds as unlisted. Required topic tags are
automatic. Then:

1. Run the discovery backfill in dry-run mode, then
   `perp-launch-preflight.ts --phase=unlisted`. Both must report no missing
   launch-discovery requirements and the preflight must have zero failures.
2. Open long, add, flip, fully close, and retry the same request idempotency key
   on every market. Partial close is not implemented in the v1 endpoint/UI.
3. Force one liquidation and one ADL on dev; verify event, balance, pool,
   user metric, and notification rows.
4. Resolve a disposable market; verify holder notifications, final price,
   remaining-pool payout, cache refresh, and that no position row remains.
5. Run the period-metric job after an add, funding event, flip, liquidation,
   ADL, and resolution; reconcile `from.day`/`from.week` with the event cash
   flows and confirm automated transitions did not change `lastBetTime`.
6. Run the league updater and confirm PERP gains/losses do not change
   `leagues.mana_earned` and do not create a `perp_profit` breakdown entry.
7. In a signed-in browser, confirm search, topic pages, browse, Explore
   activity, related markets, `%[market]`, pasted-link mentions, and
   `/embed/...` all render the PERP price/type/backing correctly on desktop and
   mobile. Preview the actual launch announcement draft against deployed DEV.
8. Leave the fast tick and hourly funding job running for at least one hour,
   then rerun the preflight and inspect scheduler CPU, lock contention, and
   contract write volume.
9. Stop a dev feed and verify both opens and closes pause at the same freshness
   boundary, the page explains why, and an alert arrives.

## Public rollout and rollback

Flip one market public at a time, rerun the public preflight, and check its
browse/feed rank before exposing the next. Start with BTC; add the slower feeds
only after reviewing their latency acknowledgment.

For an incident:

1. Set `PERPS_ENABLED = false` and deploy. This blocks new/increasing exposure;
   closes intentionally remain available.
2. Unlist affected markets.
3. If the oracle is merely stale, restore it and let users close. Do not publish
   an invented point to make the warning disappear.
4. If source integrity is compromised, preserve immutable history, investigate,
   and resolve only against a validated published point.
5. Rerun the preflight before re-enabling opens.
