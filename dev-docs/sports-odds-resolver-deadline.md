# Odds resolver deadline, retries and score ordering

The main scheduler runs the Odds API resolver every ten seconds. Its three-minute
deadline releases Croner's protection so a stalled run cannot block unrelated
markets for the client's query timeout. The deadline ends the scheduler's wait;
it does not cancel SQL, HTTP requests or an already-started resolution.

All ticks in one process share ScorePollState. Only the current run may start
further work, publish scores or change polling/backoff state. Each awaited boundary
rechecks ownership. A per-market reservation excludes replacement work while that
market's helper is pending. A tick also skips markets reserved when its initial
row read began, even if the reservation is released during that read; a later tick
must obtain fresh state.

Reservations are released in finally when the helper fulfills or rejects, even
if its run has expired. A client timeout or lost acknowledgement does not prove
rollback. Later attempts rely on the database protections below, rather than
permanently quarantining the market or assuming a timer canceled old work.

## Database protections

Score writes update only unresolved markets with an older sportsLiveUpdatedTime.
The SQL checks both the native resolution column and JSON isResolved flag, and
requires a strictly newer finite timestamp. PostgreSQL rechecks the predicates
when a concurrent row update releases its lock. A delayed old write therefore
cannot overwrite a newer score or a committed resolution. UPDATE RETURNING tells
the caller whether its patch was accepted. Rejected patches are neither published
nor followed by resolution; the next eligible tick reads the market again.

Whole-market sports resolution uses the existing serializable transaction. It
re-reads the contract, answers, metrics and liquidity, rejects an already-resolved
contract, and commits answer changes, balances, payout ledger, resolution and
metrics atomically. Concurrent attempts can fail serialization; a later retry
reads the committed state and cannot pay the same whole-market resolution twice.
This is not a new transaction policy or a general reconciliation service.

The three-minute ERROR includes all currently reserved market IDs, owner run IDs,
stages, stage-start timestamps and pending status, including earlier runs. A
helper rejection logs its market/run/stage and explicitly does not claim rollback.
Diagnostic metadata does not govern release. The optional transaction observer
remains only to distinguish acquisition, transaction and post-commit log stages;
the previous unknown-outcome classifier and issuance/commit release flags are gone.

## Retry limits

Ordinary missing or corrected scores and provider errors retain their polling and
backoff behavior. Invalid finals are left unresolved rather than guessed. Query
eligibility ends three days after the stored close time. The accepted fallback is
to leave an uncertain market unresolved, whether open or closed; no trading
suspension or forced settlement is added. Accepting delay is not a promise of
unbounded retries or immediate recovery.

A restart is not proof of cancellation. Application reservations are process-local;
SQL guards and the existing settlement transaction provide the tested database
protections. Score publication remains bounded and best-effort. This change does
not add acknowledgements or ordering for already-sent network messages, revise a
payout after a later provider correction, or cover arbitrary writers that bypass
these paths.

## Validation

The resolver race suite preserves stale-run and polling-state fences and verifies
fresh retries after settled rejection. The deadline suite exercises the real
scheduler, configured cron catch and production JSON serializer using controlled
timers; Cron scheduling and external services are stubbed. It checks pending
carryover, later release, retry, and no publication after an abandoned helper.

The opt-in local PostgreSQL regression executes actual settlement/payout math,
query generators, converters and SQL transactions with a synthetic schema and a
nonzero two-user payout fixture. It verifies concurrent settlement, rollback then
retry, a real COMMIT followed by an injected application acknowledgement failure,
delayed score writes after newer scores or resolution, and publication only after
SQL acceptance. The injected acknowledgement failure is not a physical network
fault; full production migrations, triggers, live providers and deployed alert
delivery are outside this fixture.

Use a disposable PostgreSQL 15 database named pr4178_test on an explicit loopback
port, user postgres without a password, and no mounted production data. The harness
rejects other targets and recreates its fixture tables. Set
SPORTS_ODDS_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:<port>/pr4178_test and
optionally SPORTS_ODDS_TEST_EVIDENCE_DIR, then run
`node backend/shared/test/sports-odds-postgres.cjs` from the repository root.
No environment files or production credentials are loaded. Unrelated external
services are disabled. Selected utility exports are loaded directly from their
source to avoid unrelated Firebase/HTML initialization; the settlement helper,
payout calculations and database persistence functions themselves are real.
