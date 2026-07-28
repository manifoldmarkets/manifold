# PERP launch runbook

This is the operational source of truth for the first public PERP rollout.
`perps-launch-audit.md` is the companion integration review and current
go/no-go status.
`backend/shared/src/perps/launch-manifest.ts` is the executable source of truth
for the four intended feeds and their conservative day-one settings. ECI is
explicitly excluded in both places.

## The release gate

Run from `backend/scripts` against the intended environment:

```powershell
npx.cmd ts-node perp-launch-preflight.ts --phase=feeds
npx.cmd ts-node perp-launch-preflight.ts --phase=unlisted
npx.cmd ts-node perp-launch-preflight.ts --phase=public
```

The phases mean:

- `feeds`: schema, feed history/freshness, and scheduler heartbeats must be
  healthy. Missing markets are warnings.
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

1. Keep PERPs disabled and pause their scheduler jobs during the schema change.
2. Apply every PERP migration, including immutable event/oracle accounting
   history, participation/idempotency indexes, and related-market embeddings.
   Applying a migration means executing each committed SQL file against the
   target Supabase/Postgres database. Deploying API/scheduler code alone does
   not add the required tables, columns, indexes, or triggers.
3. Deploy API and scheduler from the same audited commit, then resume the
   scheduler. The old writers tolerate the added columns; the new writers
   require them, so schema-first avoids a rolling-deploy failure window.
4. Provision `OPENROUTER_API_KEY` in the target environment.
5. Run all four backfills. Never run ECI as part of the launch batch.
6. Run `--phase=feeds`; zero failures are required.
7. Verify GCP alert policies and deliver a test incident:
   - ERROR presence for `[oracle-feeds]`, `[update-perps]`, `[openrouter]`,
     `[trump-approval]`, and scheduler `Error during job execution`.
   - Absence/dead-man alerts for `update-oracle-feeds` within two minutes and
     `update-perps` within two hours.
   - Route both policies to a channel with a real on-call owner.

## Unlisted smoke pass

Create only the four manifest feeds, with topic tags, as unlisted. Then:

1. Run `--phase=unlisted`.
2. Open long, add, flip, fully close, and retry the same request idempotency key
   on every market. Partial close is not implemented in the v1 endpoint/UI.
3. Force one liquidation and one ADL on dev; verify event, balance, pool,
   user metric, and notification rows.
4. Resolve a disposable market; verify holder notifications, final price,
   remaining-pool payout, cache refresh, and that no position row remains.
5. Run the period-metric job after an add, funding event, flip, liquidation,
   ADL, and resolution; reconcile `from.day`/`from.week` with the event cash
   flows and confirm automated transitions did not change `lastBetTime`.
6. Confirm search, topic pages, browse, explore, related markets, `%[market]`
   mentions, and `/embed/...` all render the PERP price/type/backing correctly.
   Use the built-in Browser plugin or install/enable the Chrome plugin and
   extension in the ChatGPT desktop app before assigning this pass to Codex.
7. Leave the fast tick and hourly funding job running for at least one hour,
   then rerun the preflight and inspect scheduler CPU, lock contention, and
   contract write volume.
8. Stop a dev feed and verify both opens and closes pause at the same freshness
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
