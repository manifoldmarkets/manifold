# 2028 / 2032 / 2036 generic election markets

Generic party markets (Democratic Party / Republican Party / Another party or
independent) for every Senate seat, presidential-year governorship and
presidential elector unit of the next three cycles, plus every 2028 House
district, created years ahead with the pipeline that launched the 2026
midterm markets. Prepared on 2026-10-06; **nothing here has been launched**.
Tod approves and runs the launch after the 2026 results are certified
(December 2026).

| Cycle | Senate | Governor | President | House | Markets | Mana (tier 1,000) |
|---|---:|---:|---:|---:|---:|---:|
| 2028 | 34 (Class 3) | 11 | 57 (50 states + DC + ME-1/2, NE-1/2/3 + national) | 435 | 537 | 537,000 |
| 2032 | 33 (Class 2) | 11 | 57 | — (2030 census) | 101 | 101,000 |
| 2036 | 33 (Class 1) | 11 | 57 | — | 101 | 101,000 |
| | | | | | **739** | **739,000** |

Creator: `@ManifoldPolitics`. Every market: `cpmm-multi-2` (the default),
answers sum to one, adding answers disabled, tier Ṁ1,000, public after a quiet
(unlisted → verified → published) creation.

## Files

| File | What |
|---|---|
| `inventories/senate-classes.json`, `governors.json`, `presidential-units.json`, `house-2028-states.json` | Source inventories with citations (senate.gov class pages, Wikipedia/NGA, FEC/Census, the redistricting trackers). |
| `inventories/2028.json`, `2032.json`, `2036.json` | Generated per-cycle race inventories (one row per market, with round, close time and sources). |
| `data/` | Certified presidential results used by the seeds, with provenance (`data/README.md`). |
| `cycles.ts` | Election dates, close times, idempotency series, per-state round rules (Georgia runoff, Louisiana, Maine/Alaska RCV, Vermont governor). |
| `inventory.ts`, `templates.ts`, `seeds.ts` | Race list, question/description/search-term templates, Stage A seed math. |
| `generate-manifests.ts` (+ `.test.ts`) | Writes `<cycle>/manifest.json`, `inventories/<cycle>.json`, `topics-needed.md`. |
| `market-seeds.ts` (+ `.test.ts`) | Stage B refresh: Kalshi prices, then priors blended with the certified 2026 results. |
| `topics.json`, `topics-needed.md` | Prod topic ids used, and the topics Tod still has to create. |
| `SEEDS.md` | The seed formula, parameters and the "Another party" exceptions. |
| `2028/manifest.json`, `2032/…`, `2036/…` | The manifests (series `us-<cycle>-general-v1`), `review.approved: false`. |
| `<cycle>/out/` | Dry-run output (`dry-run-report.md`, `-payloads.json`, `-plan.json`, `-dashboard-mapping.json`, `dry-run-online.json`). |
| `../create-election-markets.ts`, `../../shared/src/elections/` | The 2026 creation CLI and library (restored from tag `elections-2026-launch`), generalised for later cycles and the `president` office. |

## Commands (all from `backend/scripts`)

```powershell
# regenerate the manifests and inventories from the source files
npx ts-node --transpile-only elections-2028-2036/generate-manifests.ts

# offline dry run (no network): validation, counts, cost, payloads
npx ts-node --transpile-only create-election-markets.ts --manifest elections-2028-2036/2028/manifest.json --out elections-2028-2036/2028/out --quiet

# online dry run (read-only GETs against prod): duplicate findings per race
npx ts-node --transpile-only create-election-markets.ts --manifest elections-2028-2036/2028/manifest.json --out elections-2028-2036/2028/out --quiet --online [--resume-online] [--pace-ms 250] [--only "<raceKey regex>"]

# Stage B seed refresh (see SEEDS.md); --check writes nothing
npx ts-node --transpile-only elections-2028-2036/market-seeds.ts --check
npx ts-node --transpile-only elections-2028-2036/market-seeds.ts --results-2026 <certified-2026.json>
```

Tests (from the repository root):

```powershell
$env:TS_NODE_PROJECT = 'backend/scripts/tsconfig.json'; $env:TS_NODE_TRANSPILE_ONLY = '1'
node -r ts-node/register --test backend/scripts/elections-2028-2036/generate-manifests.test.ts
node -r ts-node/register --test backend/scripts/elections-2028-2036/market-seeds.test.ts
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

## Launch runbook (December 2026)

One apply process at a time, from one machine. The API restarts daily at
08:00 UTC: do not start an apply within 15 minutes either side of it.
Cloudflare blocks an IP for about two minutes after roughly 500 requests a
minute; the default `--pace-ms 250` keeps a run under that, so do not run two
online processes at once. Keep one folder per cycle for the state files,
outside the repo:

```
C:\Users\User\elections-2028-prod\   state.prod.json  dashboard-mapping.prod.json
C:\Users\User\elections-2032-prod\   state.prod.json  dashboard-mapping.prod.json
C:\Users\User\elections-2036-prod\   state.prod.json  dashboard-mapping.prod.json
```

(The page importer expects `state.prod.json` and `dashboard-mapping.prod.json`
together in one folder per batch; copy the `dashboard-mapping.prod.json` the
CLI writes into `<cycle>/out/` next to the state file after each run.)

1. **Create the missing topics** in `topics-needed.md` (or decide to launch
   without them), paste the ids into `topics.json`, regenerate.
2. **Refresh seeds**: build the certified-2026 results file (format in
   `SEEDS.md`), then `market-seeds.ts --check`, read the coverage report, then
   run it without `--check`. Every manifest is now `review.approved: false`
   with new seeds. Re-run the two test files.
3. **Review the online dry runs**: re-run `--online` for each cycle (the
   October runs are in `<cycle>/out/dry-run-online.json` but markets will have
   been created since). For every EQUIVALENT finding decide: skip ours (do
   nothing; the run records `skipped-existing`) or create ours anyway (list
   the contract id under that race in `rejections.json` and regenerate; it
   lands in `reviewedRejectedContractIds`). Every AMBIGUOUS finding blocks
   that entry until it is either rejected the same way or accepted as
   equivalent (then hold the entry via `holds.json`, or remove it). Races to
   keep out of a run for any other reason (for example House districts in a
   state about to redraw) go in `holds.json`; they stay in the manifest as
   `unresolved`, cost nothing and are skipped by apply.
4. **Approve**: set `review.approved: true`, `reviewedBy`, `reviewedAt` in each
   manifest; `budget.approvedMaxTotalMana` already equals the cycle's planned
   total (raise it if tiers change). Commit the approved manifests on this
   branch (never to `main`).
5. **Dry runs again** (offline, then online) on the approved manifests: zero
   validation errors, expected counts and cost.
6. **Pilot one market per cycle**: the first apply for a cycle creates its
   state file; `--only` picks the pilot and `--max-mana 1000` stops after it.
   Recommended pilots: `2028-president-US-general`, `2032-president-US-general`,
   `2036-president-US-general` (the most-watched markets; their seeds are the
   Kalshi national prices).
   ```powershell
   $env:MANIFOLD_API_KEY = '<@ManifoldPolitics key, never on the command line>'
   npx ts-node --transpile-only create-election-markets.ts --manifest elections-2028-2036/2028/manifest.json --out elections-2028-2036/2028/out --state C:\Users\User\elections-2028-prod\state.prod.json --env prod --apply --init-state --quiet --creator-username ManifoldPolitics --max-mana 1000 --only 2028-president-US-general
   ```
   Check the market page, the three opening prices (the script already
   verified them within 1.5 points), colours and visibility, and the topics.
7. **Full runs**, one cycle at a time, same state file, no `--init-state`,
   no `--only`:
   ```powershell
   npx ts-node --transpile-only create-election-markets.ts --manifest elections-2028-2036/2028/manifest.json --out elections-2028-2036/2028/out --state C:\Users\User\elections-2028-prod\state.prod.json --env prod --apply --quiet --creator-username ManifoldPolitics --max-mana 537000
   ```
   A stop (`stoppedReason`) is normal for a needs-review entry, a seed
   mismatch or a rate limit: read the state file, fix, re-run; nothing is
   created twice. Expect roughly 10–15 seconds per market (create, read back,
   three colour edits, publish), so about two hours for 2028.
8. **Afterwards**: copy `<cycle>/out/dashboard-mapping.prod.json` next to each
   state file; commit the final manifests and a record branch/tag like the
   2026 launch (`launch/elections-2026-prod`, tag `elections-2026-launch`).
   Page wiring is a separate, later task; the `dashboard` block of every entry
   carries `list`, `key`, `cycle` and `office` for it.

## Lessons carried over from the 2026 launch

- Keep candidate names out of answers and search terms (name collisions
  made two 2026 races "ambiguous"); the generic markets name nobody, and the
  tests check that no incumbent's name appears anywhere traders see.
- Existing community markets for the same race are expected, most of all for
  the national 2028 winner and swing-state presidential markets. The online
  dry run lists them with ids; Tod decides.
- The seed check (opening prices within 1.5 points of the seeds; stop if a
  reserved id already exists with moved prices) is unchanged.
