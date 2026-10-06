# Refresh election starting prices

Run before the remaining launch, from `backend/scripts`:

```powershell
# Fetch current public quotes and preview everything; writes no files.
npx ts-node --transpile-only elections-2026/market-seeds.ts --check

# Fetch again and update the two local manifests and audit artifacts.
npx ts-node --transpile-only elections-2026/market-seeds.ts
```

The script makes serialized, unauthenticated GET requests to the public
market-data API, at most one request per 300 ms. It follows cursors and backs off
on 429/5xx errors. It has no login, API-key, trading or Manifold API code.

Review `market-reseed-report.md` before setting either manifest's
`review.approved` back to `true`. Every refresh bumps the versions/timestamps and
sets approval to **false**, including when the prices have not moved. Existing
`reviewedBy`/`reviewedAt` values are historical; approval must be renewed.

The report compares against the manifests immediately before that run. A second
refresh compares against the first refresh, not against the original PVI seeds.
`--check` does not overwrite any report, snapshot, mapping or manifest. Its full
preview is printed to the terminal; redirect it to a file if desired.

Generated artifacts:

- `market-price-snapshot.json`: compact identifying text, quotes in cents, fractional
  activity fields, quote fetch times, and discovered series/events.
- `market-seed-mapping.json`: every race key, selected tickers, match evidence,
  quote/normalization decisions, old/new seeds and any reason for retaining seeds.
- `market-reseed-report.md`: separate House/ballot coverage, 25 largest changes,
  favourite distribution, all unchanged House seeds, threshold crossings and
  their optional budget effect, and thin/unmatched entries.
- Both manifests: only permitted seed fields and top-level version/review metadata
  change. The entire already-created Rhode Island entry stays byte-for-byte intact.

Liquidity tiers are unchanged. The original manifests do not implement an exact
85% tier cutoff for every race: some favourites below 85% already have tier 1,000.
The report's hypothetical budget changes use each entry's actual existing tier.
No suggested tier or budget change is applied automatically.

## Matching and price rules

House identity requires the exact state/district from the event's title plus the
2026 cycle or explicit 2027 congressional term. At-large district `0` in the
manifest is interpreted as district `1`, matching `AL` in the API's district
labels. Mutually exclusive outcomes are mapped to the audited answer metadata;
all other parties/candidates go to Other. Party-level contracts cannot distinguish
the two Democrats in CA-29. Both major-party outcomes must be quoted when both
are answers. The reference market's sworn-in-member criterion differs from our certified-winner
criterion, so these are price references, not settlement-equivalence claims.

Ballot identity is reviewed explicitly in `market-seed-review.json`: state,
designation (including audited legislative aliases), subject, cycle, and whether
source YES means approval or failure. The current API sometimes uses outdated
numbers; conflicting number/subject pairs are rejected, not remapped by subject
alone. Hashes pin the reviewed manifest identity and source identifying text;
changes require another review. A newly discovered ballot market is left
unmatched until its identity/direction is added to that reviewed file.

Two-sided spreads must be at most 10 cents. A missing bid with an ask of at most
2 cents uses ask/2, flagged in the report; the complementary high-price case uses
(bid+100)/2. Empty books, other one-sided books, inactive markets, crossed quotes
and wider spreads are not used. Last trades and volume are recorded but are not
substituted for current quotes. There is no minimum volume rule in this policy.

House midpoint weights are normalized, floored at 1%, rescaled and rounded to
one decimal place, with the remainder assigned to the largest outcome. Missing
Other has a 1% floor. Three-answer races therefore top out at 98/1/1; two-answer
races can reach 99/1. Ballots use the complementary YES/NO pair for that measure
only, invert failure-oriented contracts, then clamp to 1–99%.

Descriptions and `seed.note` stay frozen as requested, even if they describe the
original PVI/poll/50% starting prices. The new `seed.basis` and `seed.source` record
the actual chosen seed. Unmatched/thin entries retain their current values with
`source.kind=existing`; previously fetched market-price seeds are not refreshed when
their market becomes unusable. Held entries stay held.

This is a pre-launch operation. Beyond the expressly preserved Rhode Island
pilot, changing payload seeds after a batch has started will conflict with the
creation script's saved payload hashes; it does not edit existing markets.

## Verification and reproducing a snapshot

The usual creation dry runs still require no credentials and make no API writes:

```powershell
npx ts-node --transpile-only create-election-markets.ts --manifest elections-2026/manifest.json --out elections-2026/out --quiet
npx ts-node --transpile-only create-election-markets.ts --manifest elections-2026/ballot-measures/manifest.json --out elections-2026/ballot-measures/out --quiet
```

An offline audit can use `--snapshot elections-2026/market-price-snapshot.json` with
either mode. The output labels this as an offline snapshot, not a fresh fetch.
Do not use an old snapshot as a substitute for the final pre-launch refresh.

From the repository root, run the script's isolated regression tests:

```powershell
$env:TS_NODE_PROJECT = 'backend/scripts/tsconfig.json'
$env:TS_NODE_TRANSPILE_ONLY = '1'
node -r ts-node/register --test backend/scripts/elections-2026/market-seeds.test.ts
yarn --cwd=backend/shared test src/elections --runInBand
```
