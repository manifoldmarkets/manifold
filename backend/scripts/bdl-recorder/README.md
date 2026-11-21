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

Live recorders on the same machine coordinate request starts across leagues and output directories. The default is three requests per minute. Use that rate during the trial. Each attempt is saved as a JSON envelope containing its request path, parameters, timestamp, HTTP status, rate-limit counters and body. Earlier responses to the same request are retained under `history/`. Watch mode appends the time and contents of each change to `watch/<league>-<id>.jsonl`. Use Ctrl+C to finish a watch. A fresh run samples the feed again. Use `--resume` to reuse successful pages from an interrupted historical pass.

For a local, Dockerless replay, set `LOCAL_ONLY=true`, `BDL_FIXTURE_DIR` to the fixture root and optionally `SPORTS_FAKE_NOW` to an ISO timestamp, then use the replay entry point.

```sh
npx ts-node bdl-recorder/replay.ts /nba/v1/games 'per_page=1&seasons[]=2026'
```

Live recording requires a key file and refuses fixture or fake-time settings. Keep raw recordings private. Use synthetic exchange prices in committed fixtures.
