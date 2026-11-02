# Browse redesign rollout

Production defaults to Classic, with a persistent, voluntary layout switch.
Merging does **not** start the randomized rollout. Preview (`*.vercel.app`) and
localhost exercise the experiment independently; those events are excluded from
the production report.

After approval, set `NEXT_PUBLIC_BROWSE_EXPERIMENT_START` to an explicit UTC
timestamp such as `2026-11-10T00:00:00Z` in the production build environment and
redeploy. Only browsers first seen on or after that time are eligible for 50/50
assignment. Browsers already seen during the soft launch, existing accounts,
prior layout choices and unavailable storage keep Classic by default. Returning
accounts discovered after assignment also keep Classic unless they chose New.
Removing the variable and redeploying stops treatment defaults; voluntary choices
still win. Do not change the start time of a running experiment.

The v2 experiment identity (`browserId`) is independent of analytics' `deviceId`.
The latter still rotates at logout for existing signup/moderation semantics.
Only the experiment identity, enrollment, first-seen history, explicit choice and
native flags survive logout. v1 preview assignments are not used by v2.

## Reporting

From `backend/scripts`, run:

```sh
yarn ts-node browse-redesign-report.ts YYYY-MM-DD [YYYY-MM-DD]
```

Required environment:

- `BROWSE_REPORT_DATABASE_URL`: an explicitly authorized, read-only reporting
  connection, preferably a replica. The script never selects the primary or
  fetches its credentials automatically.
- `BROWSE_EXPERIMENT_START`: the same UTC launch timestamp as the frontend.

Dates bound first exposures in UTC, end exclusive. The report reads from launch
to establish the true first exposure even for later reporting windows. It uses a
read-only repeatable-read transaction, a 30-second statement timeout, a 2-second
lock timeout and set-based joins. Validate EXPLAIN on the reporting replica at
launch; synthetic PostgreSQL tests are not a production performance guarantee.

Seven-day rates use only fully matured browsers. Signup links use the signup
token observed on a browser's exposure/toggle events; trades require funded,
non-API, non-redemption buy orders. Reported assignment conflicts include changes
to either cohort or variant. Keep original assignment after manual switching
(intention to treat). Existing-account discovery is a diagnostic, not a reason to
remove assigned browsers.

Use `new-visitor / signed_in_at_entry=false` for signup and activation comparisons.
Voluntary adopters are not a randomized control. Preselect a primary metric,
sample size and harm thresholds before launch; the script gives no automatic
shipping verdict. Browsers are not people: cleared storage, multiple devices,
shared browsers and unidentified automated traffic limit interpretation. A signup
after token rotation without another browse exposure cannot be attributed. Events
are per Browse/Home visit or layout change, so monitor volume during rollout.

## Regression checks

```sh
npm ci --prefix backend/scripts/tests/runtime --ignore-scripts --no-audit --no-fund
yarn test:browse
yarn test:common --runInBand
```

The isolated, lockfile-pinned test runtime supplies jsdom and PostgreSQL/WASM.
CI runs these checks alongside the existing tests. They cover blocked storage,
logout identity, redirect exposure, offset/time-cursor retry, stale responses,
reporting boundaries and the absence of per-browser event-CTE rescans.
