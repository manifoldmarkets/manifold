// Time bounds a caller of runOracleUpdate may impose on itself.
//
// Deliberately a leaf module with no imports: it is pure policy, it is the
// part of the fast-tick change most worth testing, and engine.ts drags in the
// database, Firebase, and notification stacks that would make testing it
// there a fixture exercise rather than a unit test.

/**
 * Opt-in time bounds for an oracle update.
 *
 * ONLY the fast tick should pass these. Every other caller of runOracleUpdate
 * wants the opposite trade-off — wait however long it takes, but apply:
 *
 *   - update-perps (hourly) treats a throw as "skip this contract". Funding is
 *     charged per event rather than accrued, so a skipped run permanently
 *     loses that period's carry; the imbalanced side keeps money it owed.
 *   - the daily publishers (trump-approval, openrouter, DAU) and the admin
 *     write path would otherwise persist a point, report success, and leave
 *     the executable mark behind for a whole publication interval.
 *
 * The fast tick is the one caller for which giving up beats waiting: another
 * tick with a fresher price is already due, so a late apply is worse than
 * none. Anywhere else, a late apply is the only apply.
 */
export type OracleUpdateBounds = {
  /** Max wait for the contract lock before abandoning this update. */
  lockTimeoutMs: number
  /** Backstop for a single pathological statement. */
  statementTimeoutMs: number
  /** Attempts INCLUDING the first. See FAST_TICK_ORACLE_BOUNDS for why 1. */
  maxAttempts: number
  /**
   * Overall budget for applying one point across ALL contracts on a feed.
   *
   * The SET LOCAL timeouts bound a statement and a lock wait; they do not
   * bound a run. Contracts are applied sequentially, and pool checkout, the
   * contract query, and notifications all fall outside those timeouts, so
   * several contended markets can hold a feed in-flight across many ticks
   * without any single statement misbehaving. Remaining contracts are
   * deferred to the next tick, which carries a fresher price anyway.
   */
  runDeadlineMs: number
}

/**
 * Transaction tag for the bounded tick, so the process-wide pg-promise error
 * handler can tell a failure this path induced on itself from the same code
 * arising anywhere else. Without it that handler logs 55P03/57014 at ERROR
 * before any caller-level downgrade can apply.
 */
export const FAST_TICK_TX_TAG = 'perp-oracle-fast-tick'

export const FAST_TICK_ORACLE_BOUNDS: OracleUpdateBounds = {
  // Shorter than the tick interval on purpose: if the contract is busy, let
  // the NEXT tick apply an up-to-date price rather than apply this one late.
  lockTimeoutMs: 1_000,
  // Generous next to the lock timeout, because legitimate liquidation and ADL
  // work on a busy market is real work rather than a wait.
  statementTimeoutMs: 4_000,
  // One attempt, NOT the engine's default. The retry wrapper backs off
  // exponentially, so eight attempts can spend ~17s retrying — far past the
  // deadline these bounds exist to enforce, with every tick behind it skipped
  // by the in-flight guard. On a fast feed the next tick IS the retry, and it
  // carries a better price than the one being retried.
  maxAttempts: 1,
  // Under the 2s tick, leaving room for the feed's own fetch and write before
  // this stage begins.
  runDeadlineMs: 1_500,
}

/** lock_timeout expiry. */
const LOCK_NOT_AVAILABLE = '55P03'
/** statement_timeout expiry (also plain query cancellation). */
const QUERY_CANCELED = '57014'
/**
 * Serialization failure. Included because the engine's own pg error handler
 * already documents it as ordinary contention under the advisory-lock +
 * SERIALIZABLE pattern and logs it at WARN. A bounded tick takes one attempt,
 * so it surfaces here instead of being retried away — and it means exactly
 * what the other two mean: someone else is writing, skip and let the next
 * tick carry a fresher price.
 */
const SERIALIZATION_FAILURE = '40001'

/**
 * True for the two failures FAST_TICK_ORACLE_BOUNDS induces on itself.
 *
 * Only ever consulted on a path that actually set those bounds. An unbounded
 * caller can hit 57014 for reasons it did not ask for — an operator cancelling
 * a query, a server-side timeout — and those are genuine errors, so this must
 * not be applied globally to every cancellation.
 */
export const isOracleTickTimeout = (err: unknown) =>
  typeof err === 'object' &&
  err !== null &&
  'code' in err &&
  (err.code === LOCK_NOT_AVAILABLE ||
    err.code === QUERY_CANCELED ||
    err.code === SERIALIZATION_FAILURE)

/**
 * Bound how long an oracle tick may spend waiting on the database.
 *
 * The scheduler deliberately runs without a statement cap (see
 * ecosystem.config.js), and the per-contract advisory lock blocks
 * indefinitely. When a long-running writer held that lock during the morning
 * batch window, a single tick sat in flight for over two minutes; because
 * dispatch skips a feed while its previous run is outstanding, the feed went
 * completely dark for that whole time and the mark froze while the underlying
 * kept moving.
 *
 * Safe to abort at any point: the transaction rolls back whole, and
 * decideOracleTransition orders points by timestamp, so a skipped tick costs
 * nothing beyond its own interval.
 *
 * Inlined rather than parameterised because SET LOCAL does not accept bind
 * parameters. Both values are floored to integers first, so nothing but digits
 * can reach the statement.
 */
export const oracleTickTimeoutsQuery = (
  lockTimeoutMs: number,
  statementTimeoutMs: number
) => {
  const lock = Math.floor(lockTimeoutMs)
  const statement = Math.floor(statementTimeoutMs)
  if (!(lock > 0) || !(statement > 0))
    throw new Error(
      `oracle tick timeouts must be positive durations; got lock=${lockTimeoutMs} statement=${statementTimeoutMs}`
    )
  return `set local lock_timeout = ${lock}; set local statement_timeout = ${statement}`
}
