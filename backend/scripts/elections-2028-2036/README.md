# 2028–2036 generic election markets

Generic party markets (Democratic Party / Republican Party, plus the server's
"Other") for every general election from 2028 through 2036 (Tod,
2026-11-05: "If the market set for 2036 is prepared, we should include it.
That can be the cutoff, do 2034 as well"): every Senate seat and governorship
up in 2028, 2030, 2032, 2034 and 2036, every presidential state and district
in 2028, 2032 and 2036, and every 2028 House district. They are created years
ahead with the pipeline that launched the 2026 midterm markets. Prepared on
2026-10-06; on 2026-11-05 2030 and 2034 were added and 2036 became a planned
cycle (it was optional). **Nothing here has been launched.** Tod
approves and runs the launch after the 2026 results are certified (December
2026).

| Cycle | Senate | Governor | President | House | Markets | Mana |
|---|---:|---:|---:|---:|---:|---:|
| 2028 | 34 (Class 3) | 11 | 57 (50 states + DC + ME-1/2, NE-1/2/3 + national) | 435 | 537 | 1,518,000 |
| 2030 | 33 (Class 1) | 36 | — | — | 69 | 69,000 |
| 2032 | 33 (Class 2) | 11 | 57 | — (2030 census) | 101 | 110,000 |
| 2034 | 34 (Class 3) | 36 | — | — (2030 census) | 70 | 70,000 |
| 2036 | 33 (Class 1) | 11 | 57 | — | 101 | 110,000 |
| **2028–2036** | | | | | **878** | **1,877,000** |

Creator: `@ManifoldPolitics`. Every market: `cpmm-multi-2` (the default),
answers sum to one, `addAnswersMode: ONLY_CREATOR`, tier Ṁ1,000 unless raised
(see "Liquidity tiers" below), public after
a quiet (unlisted → verified → published) creation. The payload lists
"Democratic Party" and "Republican Party"; because answers can be added, the
server appends "Other" at the remainder of the two seeds (1% unless an
exception in `SEEDS.md` applies). Only @ManifoldPolitics can add an answer
later (a third party or a named independent), and every added answer takes
its share out of "Other". With three answers the ante is the tier itself
(Ṁ1,000, Ṁ10,000 or Ṁ100,000). Adding an answer later costs the tier's
per-answer price: Ṁ100 at 1,000, Ṁ1,000 at 10,000, Ṁ10,000 at 100,000.

### Decisions (Tod, 2026-11-05)

- **Liquidity tiers**: "add M10k liquidity to all of 2028 [presidential], and
  add M10k to the presidential winner markets for every year ... The 2028
  presidential market should have M100k." `LIQUIDITY_RULES` in
  `generate-manifests.ts` sets them (first match wins; everything else
  stays at 1,000; each raised entry says why in `liquidityPlan.rationale`):
  - `2028-president-US-general`: 100,000.
  - The other 56 presidential states, DC and districts in 2028: 10,000.
  - `2032-president-US-general` and `2036-president-US-general`: 10,000.
  - Competitive 2028 races: Senate and governor within 8 points of the
    national environment (Senate AZ, GA, NV, NH, NC, PA, WI; governor NH, NC)
    and House districts within 5 points (33 districts): 10,000. The lean is
    the seed's, rounded to one decimal as the manifest shows it. Later
    cycles' competitive races stay at 1,000 for now, to be raised as each
    cycle approaches.

  Planned totals: 2028 Ṁ1,518,000 (1 at 100,000, 98 at 10,000, 438 at
  1,000), 2030 Ṁ69,000, 2032 Ṁ110,000, 2034 Ṁ70,000, 2036 Ṁ110,000; Ṁ1,877,000
  in all. Each manifest's `budget.approvedMaxTotalMana` is its total.

- **Answers**: Democratic Party + Republican Party + the server's "Other",
  creator-only additions (was a fixed third answer, "Another party or
  independent", with additions disabled). Anyone who isn't the Democratic or
  Republican nominee resolves to "Other", or to their own answer if
  @ManifoldPolitics has added one.
- **House 2028: create all 435** now; `holds.json` stays empty. Each market
  follows whichever district is numbered N on the map in effect for the 2028
  election, and is N/A if that map has no district numbered N (the
  renumbering and seat-count N/A clauses are gone; apportionment is fixed
  until the 2030 census anyway).
- **Short descriptions**: three short plain paragraphs, no labels, about 540
  characters instead of about 2,500:
  1. what it resolves to, with the election date (and the Senate class, the
     House district rule, or the state or district), plus at most one
     sentence for a state whose deciding round differs (Georgia runoff,
     Alaska's counting method, Maine ranked-choice, Louisiana, Vermont's
     legislature, California/Washington top-two, Maine governor plurality;
     none for president);
  2. only the party matters (DFL and Democratic-NPL count as Democratic);
  3. resolves on the certified result or an AP call no recount could change,
     and when it is N/A (presidential state and district markets: see
     below).
- **President: the national market without the Electoral College, states
  and districts by their electoral votes** (Tod, 2026-11-05). The national
  market resolves to the party of "the person elected President in the
  <date> election, however the winner is officially decided" (N/A only if no
  presidential election is held for that term). It doesn't mention electors,
  270, Congress's count or a contingent election, so it still works if the
  system changes. A state market follows where the state's electoral votes
  go, however the state awards them: by its own vote, by the national
  popular vote under an interstate compact (the NPVIC), or any other way. If
  electoral votes are replaced, it follows whatever say the state has in the
  new system and is N/A if it has none. Maine's and Nebraska's state markets
  cover their two statewide electoral votes. A district market (ME-1/2,
  NE-1/2/3) follows the district's electoral vote and is N/A if the state no
  longer awards one by district. State and district markets resolve on the
  electors the state certifies, or an earlier AP call nothing could change;
  faithless electors don't change the result. They carry no ranked-choice or
  Alaska counting sentence: the certified electors already reflect each
  state's counting rules.

  Opening odds, answer curation, term-start notes and the hub link are no
  longer described. The seeds stay in the payload; a plain-language seed note
  is kept in each entry's `seed.basis` for reviewers, and the formula in
  `SEEDS.md` and `seed.source`. The full round rule with statute citations
  stays in `identity.round` and the inventories. Example (2028 Georgia
  Senate):

  > Resolves to the party that wins the November 7, 2028 U.S. Senate election
  > in Georgia (Class 3 seat). If no candidate gets a majority, the December
  > 5, 2028 runoff decides.
  >
  > Only the party matters: a Democratic or Republican nominee counts as that
  > party even if also listed on other parties' lines. Anyone else resolves to
  > Other, or to their own answer if one has been added.
  >
  > Resolves on the certified result, or earlier once the AP has called the
  > race and no recount could change it. N/A if no election for this seat is
  > held.

### 2030 (midterm)

- **Senate**: the 33 regular Class 1 seats, the same states as 2036 (verified
  on 2026-11-05 against the congress-legislators file and Wikipedia's 2030
  page: 17 D, 14 R, 2 I, all terms ending January 3, 2031). **No special
  election is known for 2030 yet**; add one when it is called. Two Class 1
  senators were 2026 nominees for governor (Minnesota, Tennessee); if they won,
  their seats get specials for the rest of the term, which are not 2030 races.
- **Governors**: the 36 states that voted on November 3, 2026 (34 four-year
  terms plus New Hampshire and Vermont, which elect every two years and so are
  in 2028 as well). Inventory: `inventories/governors-midterm.json`.
- **No House** (district lines may still change before 2030) and no president.
- Election day **November 5, 2030**; markets close at noon UTC on November 6.
  Georgia's governor needs a majority, so that market closes on December 4
  after the December 3 runoff. Alaska's governor uses its top-four/ranked-choice
  system (same clause as its Senate markets), California's is a top-two general,
  Maine's is a plurality (Maine's ranked-choice voting does not cover the
  governor's general election), Vermont's goes to the General Assembly without
  a majority. Alaska's and Hawaii's governors take office in December 2030.
- Series `us-2030-general-v1`; race keys `2030-senate-<ST>-regular-general`
  and `2030-governor-<ST>-regular-general`; dashboard lists `senate2030` and
  `governors2030`.
- Online dry run (2026-11-05, `2030/out/dry-run-online.json`): no EQUIVALENT
  market; three AMBIGUOUS ones hold two entries for review: California
  governor (two 2023 binaries on whether Sam Altman becomes or runs for
  governor "before 2030") and Texas governor (a binary "Will the democratic
  party win the 2030 texas gubernatorial election?", created 2026-11-04).

### 2034 (midterm)

- **Senate**: the 34 Class 3 seats, the same states as 2028 (Class 3's
  `cycles` in `inventories/senate-classes.json` is now 2028 and 2034; the
  term replaced expires January 3, 2035). The incumbents listed are
  informational only: these are party markets, so term limits, retirements
  or vacancies before 2034 don't affect how any market resolves.
- **Governors**: the same 36 midterm-year governorships as 2030 (34 four-year
  terms plus New Hampshire and Vermont), from
  `inventories/governors-midterm.json`.
- **No House** (new maps after the 2030 census) and no president.
- Election day **November 7, 2034**; markets close at noon UTC on November 8.
  Georgia's Senate and governor markets close on December 6 after the
  December 5, 2034 runoff. The round rules are the 2028 Senate / 2030
  governor ones (Alaska's counting method, Louisiana, Maine, Vermont's
  legislature, California and Washington top-two, the DFL and Democratic-NPL
  lines).
- Seeds: Stage A with the horizon multiplier 1 + (2034 − 2028)/12 = 1.5.
  "Other" for the Alaska and Utah Class 3 seats copies the reviewed 2028
  shares (8% and 6%).
- Series `us-2034-general-v1`; race keys `2034-senate-<ST>-regular-general`
  and `2034-governor-<ST>-regular-general`; dashboard lists `senate2034` and
  `governors2034`. Topics to create: `2034-us-elections` and
  `2034-us-congressional-elections` (`topics-needed.md`).

## Files

| File | What |
|---|---|
| `inventories/senate-classes.json`, `governors.json`, `governors-midterm.json`, `presidential-units.json`, `house-2028-states.json` | Source inventories with citations (senate.gov class pages and cross-checks, Wikipedia/NGA, FEC/Census, the redistricting trackers). `governors.json` holds the 11 presidential-year governorships, `governors-midterm.json` the 36 midterm-year ones. |
| `inventories/2028.json`, `2030.json`, `2032.json`, `2034.json`, `2036.json` | Generated per-cycle race inventories (one row per market, with round, close time and sources). |
| `data/` | Certified presidential results used by the seeds, with provenance (`data/README.md`). |
| `cycles.ts` | Cycles in scope (2028–2036), election dates, close times, idempotency series, per-state round rules (Georgia runoff, Louisiana, Maine/Alaska RCV, Vermont and the other governor rules). |
| `inventory.ts`, `templates.ts`, `seeds.ts` | Race list, question/description/search-term templates, Stage A seed math. |
| `generate-manifests.ts` (+ `.test.ts`) | Writes `<cycle>/manifest.json`, `inventories/<cycle>.json`, `topics-needed.md`. |
| `topics.json`, `topics-needed.md` | Prod topic ids used, and the topics Tod still has to create. |
| `SEEDS.md` | The seed formula, parameters, the "Other" exceptions and the reviewers' seed note. |
| `2028/manifest.json`, `2030/…`, `2032/…`, `2034/…`, `2036/…` | The manifests (series `us-<cycle>-general-v1`), `review.approved: false`. |
| `<cycle>/out/` | Dry-run output (`dry-run-report.md`, `-payloads.json`, `-plan.json`, `-dashboard-mapping.json`, `dry-run-online.json`). |
| `../create-election-markets.ts`, `../../shared/src/elections/` | The 2026 creation CLI and library (from the 2026 launch), generalised for later cycles and the `president` office. |

## Commands (all from `backend/scripts`)

```powershell
# regenerate the manifests and inventories from the source files
npx ts-node --transpile-only elections-2028-2036/generate-manifests.ts

# offline dry run (no network): validation, counts, cost, payloads
npx ts-node --transpile-only create-election-markets.ts --manifest elections-2028-2036/2030/manifest.json --out elections-2028-2036/2030/out --quiet

# online dry run (read-only GETs against prod): duplicate findings per race
npx ts-node --transpile-only create-election-markets.ts --manifest elections-2028-2036/2030/manifest.json --out elections-2028-2036/2030/out --quiet --online [--resume-online] [--pace-ms 250] [--only "<raceKey regex>"]

```

An online run with `--only` rewrites the whole `<out>` folder with just the
selected entries; point `--out` somewhere else for a partial re-check.

Tests (from the repository root):

```powershell
$env:TS_NODE_PROJECT = 'backend/scripts/tsconfig.json'; $env:TS_NODE_TRANSPILE_ONLY = '1'
node -r ts-node/register --test backend/scripts/elections-2028-2036/generate-manifests.test.ts
yarn --cwd=backend/shared test src/elections --runInBand
npx tsc --noEmit -p backend/scripts
```

## What changed in the shared tooling

- `RaceIdentity.cycle` is a number; `Office` gains `president`; the race key
  must start with `<cycle>-<office>-<ST>-` and agree with the identity.
- The duplicate classifier is year-aware (`identity.cycle`), knows the
  presidential office (state code `US` for the national market, elector
  districts for ME/NE), requires a presidential market to be about *winning*,
  treats combined and multi-year questions as needing review, and holds binary
  party markets for review in cycles after 2026 (the 2026 launch skipped on
  them). Everything else — reserved ids, seed check within 1.5 points, state
  files, quiet publishing, colours, budgets — is unchanged.
- `makeHttpApi` gained `paceMs`; the CLI gained `--only`, `--pace-ms` and a
  resumable `--online` run that writes `dry-run-online.json` after every entry.
- **Duplicate policy (2026-11-05)**: every 2028+ manifest carries
  `duplicatePolicy: { blockingCreators: ["ManifoldPolitics"] }`, set by the
  generator. Tod: "I want to re-create them all as official markets anyway, so
  that we own them." Under it, only an EQUIVALENT market created by
  @ManifoldPolitics skips an entry (we never duplicate ourselves). A market by
  anyone else, and any AMBIGUOUS market (ours included), never skips or holds
  an entry: apply records it in the state file's `existingInfo` and creates
  ours. An EQUIVALENT market whose creator is unknown is held for review,
  since it might be ours. The policy is enforced in `applyManifest` through
  `duplicateDecision`, so no CLI flag can drop it. Apply refuses a policy that
  doesn't list the run's own creator, and validation refuses an empty one.
  Manifests without the field (2026) keep the old behaviour: any EQUIVALENT
  skips, any AMBIGUOUS holds. The online dry run now saves each finding with
  its creator (`EQUIVALENT <id> @<creator> "<question>" (<reason>)`), labels
  each one in the report ("information only: community market on the same
  question", "SKIPS OURS", …), and prints `onlineDuplicates` counts (create,
  skip, review, already created).

Added with 2030 (generator only; the shared library is unchanged): Senate
classes list the cycles they are up in (Class 1: 2030 and 2036); governors come
from the presidential-year or the midterm-year inventory by cycle; presidential
units only in presidential years; the horizon multiplier became
`1 + (cycle − 2028)/12` (identical σ for 2028/2032/2036). Two description
fixes reach the existing cycles too: North Dakota's governor takes office on
December 15 (the 2028/2032/2036 North Dakota governor markets now say
"term beginning December <year>"), and Minnesota and North Dakota markets say
that the DFL and Democratic-NPL lines count as the Democratic Party (as the
2026 launch did with its "Democratic Party (DFL)" label). No seed, close time,
count or cost of 2028/2032/2036 changed.

Added on 2026-11-05 for the creator-curated answer set (shared library):
validation accepts `addAnswersMode` DISABLED (the 2026 manifests) or
ONLY_CREATOR (never ANYONE); with ONLY_CREATOR the listed seeds must leave
"Other" between 1% and 99%, "Other" must not be listed, and `answerMeta` ends
with the server's Other (`isOther: true`). The post-create check compares the
"Other" price too (100 minus the listed seeds, within 1.5 points), the answer
count and the answer mode, and stops before publishing on any difference.
"Other" gets the grey answer colour, found by `isOther` from the full market
read, and the dashboard mapping records its answer id. No 2026 behaviour
changed: every 2026 test passes unchanged.

## Launch runbook (December 2026)

One apply process at a time, from one machine. The API restarts daily at
08:00 UTC: do not start an apply within 15 minutes either side of it.
Cloudflare blocks an IP for about two minutes after roughly 500 requests a
minute; the default `--pace-ms 250` keeps a run under that, so do not run two
online processes at once. Keep one folder per cycle for the state files,
outside the repo:

```
C:\Users\User\elections-2028-prod\   state.prod.json  dashboard-mapping.prod.json
C:\Users\User\elections-2030-prod\   state.prod.json  dashboard-mapping.prod.json
C:\Users\User\elections-2032-prod\   state.prod.json  dashboard-mapping.prod.json
C:\Users\User\elections-2034-prod\   state.prod.json  dashboard-mapping.prod.json
C:\Users\User\elections-2036-prod\   state.prod.json  dashboard-mapping.prod.json
```

(The page importer expects `state.prod.json` and `dashboard-mapping.prod.json`
together in one folder per batch; copy the `dashboard-mapping.prod.json` the
CLI writes into `<cycle>/out/` next to the state file after each run.)

1. **Create the missing topics** in `topics-needed.md` (or decide to launch
   without them), paste the ids into `topics.json`, regenerate.
2. **Review seeds**: the manifests carry the Stage A priors (`SEEDS.md`).
   We don't use Kalshi's prices: we don't have permission to use their data (decided 13 Oct 2026). The seeding that relied on them has been removed.
3. **Review the online dry runs**: re-run `--online` for each cycle (markets
   will have been created since the saved runs) and read `onlineDuplicates`
   in its output and the labels in `dry-run-report.md`. Community markets
   don't block: the manifests' duplicate policy creates our official market
   anyway and lists theirs as information. Only an EQUIVALENT
   @ManifoldPolitics market skips one of ours (`SKIPS OURS` in the report),
   which is correct, since we never duplicate ourselves. `rejections.json`
   stays empty; it is only for creating ours despite one of our own
   equivalent markets. With the saved results (2028/2032/2030 from
   2026-11-05; 2036 from 2026-10-06), every entry is creatable (537 / 69 /
   101 / 101, 0 skipped, 0 held). Community markets also exist for 71 / 2 /
   1 / 2 of those races (59 2028 races with an equivalent community market,
   among them Jack1's 55 state and district presidential markets). The 19
   @ManifoldPolitics findings are all AMBIGUOUS, on the 2028 national market
   (conditionals and the candidate winner market), so they block nothing.
   Races to keep out of a run for any other reason go in `holds.json`; they
   stay in the manifest as `unresolved`, cost nothing and are skipped by
   apply. House districts are **not** held (Tod, 2026-11-05): all 435 are
   created, and each follows whichever district carries its number on the
   2028 map.
4. **Approve**: set `review.approved: true`, `reviewedBy`, `reviewedAt` in each
   manifest; `budget.approvedMaxTotalMana` already equals the cycle's planned
   total (raise it if tiers change). Commit the approved manifests on this
   branch (never to `main`).
5. **Dry runs again** (offline, then online) on the approved manifests: zero
   validation errors, expected counts and cost.
6. **Pilot one market per cycle**: the first apply for a cycle creates its
   state file; `--only` picks the pilot and `--max-mana` stops after it. Pilot
   a Ṁ1,000 market first, so a pipeline problem costs Ṁ1,000: for 2028
   `2028-senate-AL-regular-general`, for 2030, 2034 and 2036
   `<cycle>-senate-PA-regular-general` (a plain plurality seat with the full
   Senate topic set; Pennsylvania is at 1,000 outside 2028), for 2032
   `2032-senate-AL-regular-general` (Class 2). Then create the 2028 national
   market on its own and check it before the full run, since it costs
   Ṁ100,000 (the 2032 and 2036 national markets cost Ṁ10,000 each and can go
   with the full runs).
   ```powershell
   $env:MANIFOLD_API_KEY = '<@ManifoldPolitics key, never on the command line>'
   npx ts-node --transpile-only create-election-markets.ts --manifest elections-2028-2036/2028/manifest.json --out elections-2028-2036/2028/out --state C:\Users\User\elections-2028-prod\state.prod.json --env prod --apply --init-state --quiet --creator-username ManifoldPolitics --max-mana 1000 --only 2028-senate-AL-regular-general
   npx ts-node --transpile-only create-election-markets.ts --manifest elections-2028-2036/2028/manifest.json --out elections-2028-2036/2028/out --state C:\Users\User\elections-2028-prod\state.prod.json --env prod --apply --quiet --creator-username ManifoldPolitics --max-mana 100000 --only 2028-president-US-general
   npx ts-node --transpile-only create-election-markets.ts --manifest elections-2028-2036/2030/manifest.json --out elections-2028-2036/2030/out --state C:\Users\User\elections-2030-prod\state.prod.json --env prod --apply --init-state --quiet --creator-username ManifoldPolitics --max-mana 1000 --only 2030-senate-PA-regular-general
   ```
   Check the market page, the three opening prices (Democratic, Republican
   and "Other"; the script already verified all three within 1.5 points, the
   answer count and the answer mode), that only the creator can add answers,
   colours and visibility, and the topics.
7. **Full runs**, one cycle at a time, same state file, no `--init-state`,
   no `--only` (`--max-mana`: each cycle's planned total, which is also its
   `budget.approvedMaxTotalMana`: 1518000 for 2028, 69000 for 2030, 110000
   for 2032, 70000 for 2034, 110000 for 2036; the run cap counts only what that
   run spends, so after the pilots the 2028 full run needs at most
   1417000):
   ```powershell
   npx ts-node --transpile-only create-election-markets.ts --manifest elections-2028-2036/2028/manifest.json --out elections-2028-2036/2028/out --state C:\Users\User\elections-2028-prod\state.prod.json --env prod --apply --quiet --creator-username ManifoldPolitics --max-mana 1518000
   ```
   A stop (`stoppedReason`) is normal for a needs-review entry, a seed
   mismatch or a rate limit: read the state file, fix, re-run; nothing is
   created twice. Expect roughly 10–15 seconds per market (create, read back,
   three colour edits, publish), so about two hours for 2028 and 15–20 minutes
   for 2030.
8. **Afterwards**: copy `<cycle>/out/dashboard-mapping.prod.json` next to each
   state file; commit the final manifests on a record branch/tag.
   Page wiring is a separate, later task; the `dashboard` block of every entry
   carries `list`, `key`, `cycle` and `office` for it.

## Open questions for the 2030 review

- **Alaska**: the market text is neutral ("The final count under whatever
  counting method Alaska uses in <year> decides."), but `identity.round` and
  the inventories still say the repeal initiative "is on the November 3, 2026
  ballot". Once that result is certified, update `cycles.ts` and regenerate.
- **Maine governor**: the market says plurality unless Maine extends
  ranked-choice counting to governor races (that needs a constitutional
  change).
- **"Other" shares**: 2030 copies the reviewed 2036 Class 1 shares
  (ME 10%, NE 5%, VT 10%), but 2030 is when King's and Sanders's own seats are
  up. Alaska and Maine governors stay at 1% by convention despite independent
  winners in the past.
- **Specials**: Minnesota's and Tennessee's Class 1 seats get specials for
  the rest of the term if their senators were elected governor on 2026-11-03.
  Those specials would be extra 2028 (or earlier) races, not part of this
  inventory.
- **Topics**: no 2030 election topic exists in prod; `2030-us-elections` could
  be named "2030 Midterms" to match the 2026 topic.

## Lessons carried over from the 2026 launch

- Keep candidate names out of answers and search terms (name collisions
  made two 2026 races "ambiguous"); the generic markets name nobody, and the
  tests check that no incumbent's name appears anywhere traders see.
- Existing community markets for the same race are expected, most of all for
  the national 2028 winner and swing-state presidential markets. They no
  longer block (the duplicate policy above): the online dry run lists them
  with ids and creators as information, and we create the official market.
- The seed check (opening prices within 1.5 points of the seeds; stop if a
  reserved id already exists with moved prices) is unchanged.
