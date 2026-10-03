# 2026 ballot-measure market creation (separate reviewed manifest)

This creates one binary market per statewide ballot question that has no suitable existing market. It reuses the election creation script, but with its **own manifest and idempotency series** (`us-2026-ballot-measures-v1`). The House/Senate/governor manifest (`../manifest.json`, series `us-2026-general-v1`) is untouched. The validator refuses to mix the two.

The user selected **@ManifoldPolitics** and approved a combined **410,000-mana ceiling**, conditional on the independent audit passing before creation. This manifest is allocated **103,000**, alongside **306,000** for races (409,000 total). Optional upgrades and subsidies are excluded. **Payload review remains unapproved:** `review.approved` is false. Include starting probabilities in that review: 71 of the 103 ready ballots are seeded at 50%, and 91 are flagged for seed review.

Read [integration decisions](audit/INTEGRATION.md) first: the UI withholds Massachusetts Question 9 in addition to the audit's held mappings. Proposed new markets close November 4 at 12:00 UTC, after US polls close.

| File | What it is |
|---|---|
| `manifest.json` | One `ballot-measure` entry per genuine gap. Each entry holds:<br>• identity: state, official designation, title, aliases, approval rule, certifier and official source<br>• `yesMeaning`<br>• the exact binary payload<br>• seed and review flag<br>• baseline tier 1,000, plus `enhancedTier` 10,000 where recommended<br>• rejected markets and portfolio answers<br>• the dashboard row<br>Entries are `unresolved` (excluded from apply) when identity, threshold or source could not be confirmed. |
| `audit/measure-inventory.json` | Every measure: verified identity and rules, sources, coverage status. |
| `audit/recommended-mappings.json` | Every audited measure: recommended source (contract and answer IDs, YES orientation, rules, evidence, depth, simulated buys), alternatives, rejected answers, subsidies. |
| `audit/INTEGRATION.md` | Integration decisions and current costs. |
| `out/` (generated) | Dry-run report, payloads, plan and dashboard mapping. |

## Market shape and rules

Each market is a binary whose YES means the measure is approved at the November 3, 2026 election. The question reads:

> Will {State} {Designation} ({short subject}) be approved in the November 3, 2026 election?

`measureDescriptionMarkdown` (in `backend/shared/src/elections/election-market-creation.ts`) gives every market the same rules:

- **Approval rule:** the official rule, quoted verbatim. This covers 55%, 60%, two-thirds, Tennessee's governor-vote rule, Wyoming's majority of all ballots cast, and Nevada's second-vote requirement.
- **Which vote counts:** only the 2026 vote.
- **Advisory questions:** YES means voter approval, not that the measure becomes law.
- **Result:** the certified result, with recounts handled.
- **No vote:** **N/A** if the measure is removed, its votes are not counted, or the vote is postponed.
- **Later court rulings:** these do **not** change the result.

## Run it

```sh
cd backend/scripts
# dry run: no credentials, no writes
npx ts-node --transpile-only create-election-markets.ts \
  --manifest elections-2026/ballot-measures/manifest.json \
  --out elections-2026/ballot-measures/out [--online]

# apply: only after a reviewer approves the manifest, sets the budget, and
# chooses which recommended 10,000 upgrades to accept. Not run by the audit.
MANIFOLD_API_KEY=… npx ts-node --transpile-only create-election-markets.ts \
  --manifest elections-2026/ballot-measures/manifest.json \
  --state elections-2026/ballot-measures/state.prod.json \
  --env prod --apply --creator-username <account> --max-mana <cap>
```

Apply keeps every safeguard of the race manifest:

- the reserved-ID read before any write;
- a deterministic `idempotencyKey`;
- paginated duplicate searches;
- run, manifest and balance caps;
- persisted state after every request;
- a stop on any ambiguous outcome.

For measures, the duplicate check matches the official designation and aliases, and checks every open portfolio answer by answer ID. It treats a different state, a different year or a qualification-only question as unrelated. It holds opposite wording ("fail", "rejected"), repeal or overturn wording, and conditional, combined, margin, court or implementation questions for review.

To accept a recommended upgrade, set that entry's `payload.liquidityTier` to its `liquidityPlan.enhancedTier` before review. The dry-run report shows both the baseline and the upgraded total.

## Tests

```sh
cd backend/shared && node ../../node_modules/jest/bin/jest.js src/elections
```

`election-ballot-measures.test.ts` covers:

- validation: question shape, threshold quoted verbatim, N/A, recount, certification and court rules, second votes, advisory wording, separate series;
- duplicates: binary, portfolio answer by ID, reversed wording, the same number in another state or year, qualification-only questions, ballot-placement conditions, conditional and repeal wording;
- apply: cancelled markets, budget caps and resume.
