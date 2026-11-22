# Recording league fixtures

From the `backend/scripts` directory, point `BDL_SPEC_DIR` at a local directory of public league OpenAPI YAMLs and `BDL_RECORDINGS_DIR` at a private directory outside Git. Task worktrees under `<build>/wt/` also discover `<build>/research/specs` and `<build>/recordings` automatically. The CLI accepts `--spec-dir` and `--out` overrides.

```sh
npx ts-node bdl-recorder/index.ts --plan --leagues all
npx ts-node bdl-recorder/index.ts --free-tier --leagues mma,nba --rate 3 --key-file <path>
npx ts-node bdl-recorder/index.ts --leagues nhl --resume --key-file <path>
npx ts-node bdl-recorder/index.ts --plan --probe P-M1 --leagues mma
npx ts-node bdl-recorder/index.ts --watch mma:123 --key-file <path>
```

A plan lists the initial requests and the requests that depend on IDs returned by earlier steps. It reports the number of request templates. Actual HTTP totals include whichever IDs are available, cursor pages and retries. The free-tier smoke test has four initial requests and covers NBA teams and games plus MMA leagues and events.

Live recorders on the same machine coordinate request starts across leagues and output directories. The default is three requests per minute. Use that rate during the trial. The summary counts actual transport dispatches (including retries), HTTP responses before decoding, and usable snapshots (persisted, decoded 2xx responses with a data array or detail object, including an empty list). It reports them as `dispatched`, `httpResponses` and `usableSnapshots`. The compatibility fields `calls` and `successful` mirror dispatches and usable snapshots. Resuming a saved response incurs no dispatch. Each safely decoded attempt is saved as a JSON envelope containing its request path, parameters, timestamp, HTTP status, rate-limit counters and body. Every saved response is published under `history/<parameter-hash>/<revision>/response.json` before the derived `<parameter-hash>.latest` cache is refreshed. A mirror failure stops the run and increments `cacheRefreshFailures` while retaining the committed response count. Resume and local replay read the contiguous numbered history even after interruption. A missing or incomplete numbered revision holds further appends for inspection. Revisions use publication order, including responses with equal request timestamps.

Older recorder versions retain their own `<parameter-hash>.json` and flat `history/*.json` files. The new writer leaves those files intact. Before saving, and when resuming a selector with numbered history, it imports any distinct current legacy envelope byte-for-byte. A read-only replay uses the numbered prefix when available. When enumerating a mixed archive, count the numbered revisions and any distinct unimported legacy evidence. Ignore `.latest` mirrors and `.pending-*` staging directories. Watch mode appends the time and contents of each change to `watch/<league>-<id>.jsonl`. Use Ctrl+C to finish a watch. A decoded 2xx response without a data page is archived. Other requests can proceed, and an incomplete watch poll leaves the preceding change intact. A fresh run samples the feed again. Use `--resume` to reuse successful pages from an interrupted historical pass.

For a local, Dockerless replay, set `LOCAL_ONLY=true`, `BDL_FIXTURE_DIR=../shared/test/fixtures/bdl` from `backend/scripts` (or point to a private recording root) and optionally `SPORTS_FAKE_NOW` to an ISO timestamp, then use the replay entry point.

```sh
npx ts-node bdl-recorder/replay.ts /nba/v1/games 'per_page=1&seasons[]=2026'
```

The example replays the checked-in synthetic NBA envelope. Named adapter samples containing only `data` and optional `meta` have no request identity and are skipped. Other named replay scenarios must contain `request`, `status` and `body` and match the query. A missing match reports an error without a provider request.

Live recording requires a key file and refuses fixture or fake-time settings. Keep raw recordings private. Use synthetic exchange prices in committed fixtures.
