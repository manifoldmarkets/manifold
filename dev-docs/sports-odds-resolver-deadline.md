# Odds resolver deadline and mutation ownership

The main scheduler runs the Odds API resolver every ten seconds. Its three-minute
deadline releases Croner's protection so a dead connection cannot block every
game for the client's one-hour query timeout. The deadline is a limit on the
scheduler's wait, **not cancellation of SQL, an HTTP request, or a resolution
transaction that has already started**.

All ticks in this scheduler process share one `ScorePollState`. Only the current
run may start further requests, update polling/backoff state, publish a score or
enter resolution. Each awaited boundary checks that ownership again.

Before processing a market, a tick reserves it through its score write,
publication, answer read and resolution. A replacement tick skips that market
while processing other games. It also skips markets reserved when its initial
row read began, even if the reservation is released during the read: only a later
tick with a fresh row can process those markets. The original mutation can finish
after the deadline, but the old run cannot initiate the next side effect or alter
the replacement's polling state. Reservations are released after confirmed
completion, including a read-only or pre-mutation failure.

## Unknown mutation outcomes

A rejected promise does not always prove that database work stopped. In
particular, the client's `Query read timeout` or connection loss may leave a
statement running or its commit result unknown. The resolver retains that
market's reservation for the life of the process and emits an ERROR naming the
market and recovery steps, even if the run has already expired. No timer clears
the reservation. Other games continue; this market receives no automatic score
writes or resolution attempts from subsequent ticks in the same process.
It may remain unresolved and tradable until operator intervention; retaining
the reservation does not automatically close trading.

Known server rejections (serialization/deadlock failure, lock/statement timeout,
foreign-key/unique/check violations) release the reservation. A resolution
`APIError` also releases it: `pg-promise` awaits rollback before propagating the
callback error and substitutes the rollback error if rollback fails. Unknown
errors remain conservative; this is not a general error classifier.

Connection acquisition failures release the reservation because the write has
not been issued. Score writes acquire a task connection first and recheck run
ownership inside its callback. Resolution observes entry into its transaction
callback and successful COMMIT. Failures before callback entry or after confirmed
COMMIT (for example notification or page revalidation failures) release the
reservation; they do not claim an uncertain payout outcome. A lost COMMIT
acknowledgment remains unknown.

An operator must inspect the named market and establish that its old database
session/transaction has ended before manually resolving it or restarting the
scheduler to reset reservations. Restarting alone is not proof of cancellation.
There is no automatic reconciliation or durable cross-process fence here. Normal
deployment/restart overlap, multiple scheduler instances, and other market
writers remain outside this process-local contract.

Score publication retains the existing bounded, best-effort HTTP helper. The
reservation covers the awaited helper call; this does not add delivery
acknowledgments or ordering for requests already sent over the network. Already
received score updates are ordered by `sportsLiveUpdatedTime` in the existing
schedule UI; the resolver does not change that consumer contract. Already
entered resolution is allowed to complete with the score accepted at entry;
this change does not revise payouts after a later provider correction.

## Offline validation

`backend/shared/src/odds-markets-review.test.ts` preserves the four reproduced
race conditions and exercises deferred score writes, publication, answer reads
and resolution, stale read snapshots, replacement finals, stale provider
success/failure and follow-up requests, shared state, unknown mutation outcomes
and confirmed failures. Dependencies are mocked; no live provider, API or
production database validation is implied. Scheduler deadline probes separately
exercise timeout/replacement ownership with controlled timers.
`backend/shared/src/resolve-market-lifecycle.test.ts` additionally exercises the
real resolution helper across connection failure, delayed/lost COMMIT
acknowledgment and post-commit revalidation failure with an offline adapter.
