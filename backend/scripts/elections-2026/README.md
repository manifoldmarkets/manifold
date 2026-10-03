# 2026 election market creation (unapproved proposal)

Fills genuine coverage gaps on the 2026 election dashboard by creating
general-election markets through the normal authenticated API. Nothing here
writes to a database.

| File                                                                    | What it is                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `manifest.json`                                                         | One entry per race that needs a market (or is blocked), with the exact create payload, audited answer metadata, seed basis, liquidity plan, rejected alternatives and search terms. `review.approved` is **false** and `budget.approvedMaxTotalMana` is **null** until a reviewer fills them in. |
| `audit/`                                                                | The audit report, race inventory with coverage status, and the recommended-source mapping JSON this manifest was built from.                                                                                                                                                                     |
| `simulate-election-buys.ts`                                             | Read-only Ṁ10 and Ṁ100 price-impact simulation using `common/new-bet`, on a DB snapshot or on the manifest's planned pools.                                                                                                                                                                      |
| `../create-election-markets.ts`                                         | The CLI.                                                                                                                                                                                                                                                                                         |
| `../../shared/src/elections/election-market-creation.ts` (+ `.test.ts`) | Planning, validation, budget, duplicate checks, resume, and mapping output.                                                                                                                                                                                                                      |

## Dry run (default: no credentials, no writes)

```sh
cd backend/scripts
npx ts-node --transpile-only create-election-markets.ts \
  --manifest elections-2026/manifest.json --out elections-2026/out
```

This writes the following into `--out`:

- `dry-run-report.md`: readable per-race review with cost and seeds.
- `dry-run-payloads.json`: exact request bodies, plus each body's reserved idempotency key.
- `dry-run-plan.json`: action per race and any validation errors.
- `dry-run-dashboard-mapping.json`: the mapping rows, with `PENDING:<raceKey>` in place of every ID.

Add `--online` to repeat the duplicate check against the public API. It sends only unauthenticated GETs: `/v0/market/:reservedId` and `/v0/search-markets`.

## Apply (only after review; never run by the audit)

1. A reviewer reads `out/dry-run-report.md`, resolves or removes the `unresolved` entries, and sets the manifest's review fields. Set `review.approved: true` and fill in `review.reviewedBy` and `review.reviewedAt`. Then set `budget.approvedMaxTotalMana`, which caps spending across all runs.
2. Run the command below. Put the creator account's API key in the environment only, and never in a file or on the command line history of a shared machine:

```sh
cd backend/scripts
MANIFOLD_API_KEY=… npx ts-node --transpile-only create-election-markets.ts \
  --manifest elections-2026/manifest.json \
  --state elections-2026/state.prod.json \
  --env prod --apply \
  --creator-username <account that will own the markets> \
  --max-mana <cap for this run>
```

What apply does, per entry, in manifest order:

1. **Reconcile.** It reads `GET /v0/market/<reserved id>`. The create API stores `idempotencyKey` as the contract ID and rejects a second create with the same key, so a market already at that ID gets recorded and is never re-sent.
2. **Budget.** It stops before the next create would exceed `--max-mana` for this run, the approved manifest cap counting earlier runs, or the creator's balance. Cost is the API ante, `max(answers × per-answer cost, tier)`, plus any `extraLiquidity`. The API has no server-side spend cap, so this cap is enforced client-side.
3. **Duplicate recheck.** It searches by race identity (office, state, district, year, round and candidate names), not by title. An equivalent market is recorded and skipped. An ambiguous one is held as `needs-review` and nothing is created. Markets the audit already rejected (`reviewedRejectedContractIds`) don't block.
4. **Create.** It persists `in-flight` before the request and `created` afterwards, with the contract ID, slug, URL and answer IDs read back from the API.
5. **Failure handling.**
   - Rate limits (429) wait and retry with the same key.
   - Ambiguous outcomes (timeout, network error, 5xx) are reconciled read-only by the reserved ID. If the market isn't there, the entry becomes `pending-reconciliation` and the run stops. A later run checks that entry read-only again and only re-sends with `--retry-unconfirmed`; even then, the reserved ID still blocks duplicates.
   - 4xx rejections isolate that entry. A 401 or 403 stops the run.

The state file is rewritten atomically after every request. Use one apply process and one state file per environment/series. Read the recorded status before resuming.

After apply, `out/dashboard-mapping.prod.json` holds the rows in the shapes the dashboard uses (`senate2026`, `governors2026` and `HOUSE_RACE_MARKETS`), with real IDs, answer IDs and audited party/candidate metadata.

## Tests

```sh
cd backend/shared
node ../../node_modules/jest/bin/jest.js src/elections
```

All requests are mocked. The tests cover:

- no writes in a dry run;
- refusing apply without review, creator, budget or flag;
- duplicate avoidance, both at the reserved ID and by search;
- run and manifest budget caps;
- partial failure and resume from the persisted state;
- ambiguous timeouts, both landed and unconfirmed;
- rate-limit retry with the same key.

## Limits that the API does not let this script enforce

- No server-side spend cap, and no dry-run endpoint. Budget and validation are client-side, so the API may still reject a body this script accepts.
- Search is best effort. A market whose title, answers and description avoid the state, office and candidate names will not be found. That is why the audit also did a database pass, and why an ambiguous match blocks creation.
- `idempotencyKey` protects against duplicates only from this manifest series. Changing `series` makes new keys.
- The integrated manifest closes after election night, and Georgia/Louisiana entries cover the scheduled runoff dates. Postponements still require creator intervention.

## Integration review

The preserved audit report describes the original October 3 proposal. See `audit/INTEGRATION.md` for implemented mappings and deviations. Version 2026-10-03.2 adjusts close times, paginates duplicate searches and rejects non-finite spending caps. The review remains unapproved and no creator account or budget is set. Run `--online` again before any apply; the original online audit checked only the first search page.
