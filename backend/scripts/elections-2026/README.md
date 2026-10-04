# 2026 election market creation

Launch approval (October 3): the owner approved proceeding after the independent audit fixes, accepting neutral 50% seeds for the 90 flagged ready ballot measures. Both manifests now have recorded approval. The plan remains 225 races at 306,000 mana and 102 ballots at 102,000 mana, within the 410,000 combined ceiling. Held entries and optional upgrades are excluded. Start with a small race batch to verify production multi-answer seed support, then resume using the same state files.

October 4 presentation update: party answers now include the audited nominee's name where exactly one nominee has that affiliation (432 labels). They still resolve by ballot party, including a replacement nominee; names are informational. The Rhode Island and CA-29 candidate markets retain their candidate outcomes. Costs, seeds, criteria, series and reserved IDs are unchanged. The original Rhode Island pilot is retained on resume.

After seed verification, the script saves answer colors through the existing authenticated `POST /edit-answer-cpmm` endpoint: Democratic blue, Republican red, independent teal, and neutral for other outcomes. It uses audited answer metadata, including DFL and named candidates. Each successful color edit is recorded in state. A failed edit stops with the full creation cost recorded; resuming finishes the remaining edits before publishing, without recreating markets or spending more mana. Already-created entries with the same payload receive colors on resume, including the pilot. Entries whose payload changed are left intact. Dry-run payload files include the planned color edits. No backend deployment is needed for this step.

Use `--quiet` for this bulk launch. It creates each market **unlisted**, verifies the starting prices, then publishes through `POST /v0/market/:id/update`. The existing server only fans out new-market follower notifications/emails for public creation; changing visibility does not repeat that fan-out. This keeps the resulting markets public and searchable. No new backend deployment is needed for the quiet path. The account must be eligible to create unlisted markets; a rejection stops the run rather than falling back to public creation. Descriptions must not mention users if mention notifications are also unwanted.

Publication is recorded separately as `pendingPublication`. A failed/uncertain publish stops after recording the full creation cost; a resume retries the visibility update without creating or charging again. A seed failure leaves the market unlisted until reviewed. Use the same `--quiet` option on dry runs and every apply. Dry-run payloads show the unlisted create body and the subsequent public visibility update.

The first production race is Rhode Island governor, costing 10,000. A 3,000 run cap would stop before creating anything. A **10,000 pilot** creates that one market, verifies its four answer seeds, publishes it, and stops at the next market with `stoppedReason: "run budget: ..."` (exit 1 is expected for that cap).

Fills genuine coverage gaps on the 2026 election dashboard by creating
general-election markets through the normal authenticated API. Nothing here
writes to a database.

| File                                                                    | What it is                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `manifest.json`                                                         | One entry per race that needs a market (or is blocked), with the exact create payload, audited answer metadata, seed basis, liquidity plan, rejected alternatives and search terms. Launch is approved. The accepted funding cap is 306,000 mana; ballot measures and subsidies are excluded. |
| `audit/`                                                                | The audit report, race inventory with coverage status, and the recommended-source mapping JSON this manifest was built from.                                                                                                                                                                  |
| `simulate-election-buys.ts`                                             | Read-only Ṁ10 and Ṁ100 price-impact simulation using `common/new-bet`, on a DB snapshot or on the manifest's planned pools.                                                                                                                                                                   |
| `../create-election-markets.ts`                                         | The CLI.                                                                                                                                                                                                                                                                                      |
| `../../shared/src/elections/election-market-creation.ts` (+ `.test.ts`) | Planning, validation, budget, duplicate checks, resume, and mapping output.                                                                                                                                                                                                                   |

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
# first run for this manifest and environment only: add --init-state
```

Before anything is read with the key, apply refuses unless `--env` is given explicitly and the `--state` file already exists (or `--init-state` is passed). On its first run the state file records the API base and creator account, and later runs refuse a mismatch, so a dev state file can never be reused on prod. A `<state>.lock` file blocks a second concurrent run. State is loaded only after acquiring the lock, so an older snapshot cannot overwrite a just-finished run. A crash leaves the lock in place on purpose; delete it only when no run is active.

What apply does, per entry, in manifest order:

1. **Reconcile.** It reads `GET /v0/market/<reserved id>`. The create API stores `idempotencyKey` as the contract ID and rejects a second create with the same key, so a market already at that ID gets recorded and is never re-sent.
2. **Budget.** It stops before the next create would exceed `--max-mana` for this run, the approved manifest cap counting earlier runs, or the creator's balance. Cost is the API ante, `max(answers × per-answer cost, tier)`, plus any `extraLiquidity`. The API has no server-side spend cap, so this cap is enforced client-side.
3. **Duplicate recheck.** It searches by race identity (office, state, district, year, round and candidate names), not by title. Searches request answers (`includeLiteAnswers`), and a multi-answer hit that might block creation is re-read in full, so resolved answers are judged correctly. A 404 or a malformed search result stops the run. The server returns HTTP 200 with no rows if a search query fails, so pages are kept small (100) to stay inside its statement timeout. An equivalent market is recorded and skipped. An ambiguous one is held as `needs-review` and nothing is created. Markets the audit already rejected (`reviewedRejectedContractIds`) don't block.
4. **Create.** It persists `in-flight` before the request and `created` afterwards, with the contract ID, slug, URL and answer IDs read back from the API. For multi-answer markets it compares the opening answer probabilities with `answerProbs` and stops if they differ by more than 1.5 points or cannot be read. An API without `answerProbs` support would silently open every race at an even split. The created record retains its full cost and a `seedReviewRequired` reason; all later runs stop until a person reviews the market and API seed support, then clears that field. Reserved-ID reconciliation checks the seeds too; if trading has moved the current prices, inspect the opening prices manually before clearing the block.
5. **Failure handling.**
   - Rate limits (429) wait and retry with the same key.
   - Ambiguous outcomes (timeout, network error, 5xx) are reconciled read-only by the reserved ID. If the market isn't there, the entry becomes `pending-reconciliation` and the run stops. A later run checks that entry read-only again and stops if it is still unconfirmed. It only re-sends with `--retry-unconfirmed`; even then, the reserved ID still blocks duplicates.
   - A 2xx reply without a contract ID is treated as ambiguous and reconciled by the reserved ID, not recorded as failed.
   - Any 4xx rejection marks that entry `failed` and stops the run, since a schema or path problem would repeat for every entry. A later run reads a failed entry's reserved ID before skipping it, so a market that exists is recorded at its full cost.

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
- Search is best effort. A market whose title, answers and description avoid the state, office and candidate names will not be found. Also, the current server converts database search failures into HTTP 200 empty lists, which this client cannot distinguish from a successful empty search. Smaller pages reduce timeout risk but do not fix this API limitation. That is why the audit also did a database pass, and why an ambiguous match blocks creation.
- `idempotencyKey` protects against duplicates only from this manifest series. Changing `series` makes new keys.
- The integrated manifest closes after election night, and Georgia/Louisiana entries cover the scheduled runoff dates. Postponements still require creator intervention.

## Integration review

The preserved audit report describes the original October 3 proposal. See `audit/INTEGRATION.md` for implemented mappings and deviations. Version 2026-10-03.2 adjusts close times, paginates duplicate searches and rejects non-finite spending caps. Version 2026-10-03.3 records the user's accepted 306,000 mana budget: 216 noncompetitive House markets at 1,000 each, eight closer House markets at 10,000 each, and Rhode Island governor at 10,000. That version preceded creator selection and approval; the current launch approval is recorded above. Ballot measures and existing-market subsidies are outside this race budget. Run `--online` again before any apply; the original online audit checked only the first search page.
