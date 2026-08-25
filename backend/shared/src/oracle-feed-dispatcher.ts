// Slot management and orphan accounting for the oracle tick.
//
// Extracted from update-oracle-feeds so it can be tested against a
// never-settling source, which is the one failure it exists to survive and the
// one that cannot be reproduced through the job's own entry point.
//
// It lives in shared rather than beside the job for the same reason
// oracle-tick-bounds does: the scheduler package has no test runner, and this
// is the part of the change most worth testing. Nothing here is
// scheduler-specific — it is slot management and orphan accounting over any
// keyed async work.
//
// A factory rather than module state: the whole contract is about counters
// that persist across calls, so tests need a fresh instance and production
// needs exactly one.

export type FeedDispatcherOptions = {
  /** How long a run may be in flight before it is cancelled and re-armed. */
  deadlineMs: number
  /** Orphans on ONE feed before that feed stops polling. */
  maxAbandonedPerFeed: number
  /**
   * Orphans across ALL feeds before any feed stops polling. This is the bound
   * that protects shared resources; the per-feed one is only fairness.
   *
   * NOTE the ceiling is soft by one dispatch round. The check reads the count
   * before the run starts, but the count only rises when that run's deadline
   * fires a minute later, and the cron dispatches every due feed in one
   * synchronous pass — so a round that starts under the cap can finish over
   * it, by at most one orphan per feed. The reachable maximum is therefore
   * `maxAbandonedTotal + feedCount`, not `maxAbandonedTotal`. Bounded, which
   * is the property that matters; not exact, which it does not need to be.
   * Making it exact would mean reserving against a count of in-flight runs and
   * refusing polls on healthy feeds, which is a worse trade.
   */
  maxAbandonedTotal: number
  log: {
    (message: string): void
    error: (message: string) => void
  }
  /** Throttle for the "refusing to poll" line. */
  refusalLogIntervalMs: number
}

export type FeedDispatcher = ReturnType<typeof createFeedDispatcher>

export const createFeedDispatcher = (opts: FeedDispatcherOptions) => {
  /** Start time of the run currently in flight, or absent when idle. */
  const inFlightSince: Record<string, number> = {}
  /** Stamped before work starts, so a hang does not earn an instant retry. */
  const lastAttemptAt: Record<string, number> = {}
  /** Last time a run finished without having been abandoned. */
  const lastSuccessAt: Record<string, number> = {}
  /**
   * Runs whose promise we stopped waiting on. They may still hold a socket, a
   * pool connection, or memory, so this — not the count of dark feeds — is what
   * bounds the damage.
   *
   * Decremented ONLY when the underlying promise actually settles. A run we
   * cancelled that then refuses to settle is precisely the pathology the
   * deadline exists for, and it must stay counted.
   */
  const outstandingAbandoned: Record<string, number> = {}
  /** Feeds currently refusing to poll because orphans hit a ceiling. */
  const refused: Record<string, boolean> = {}
  /** The step each in-flight poll last STARTED, so a wedge names itself. */
  const phase: Record<string, string> = {}
  /**
   * Identity of the run that currently owns each slot.
   *
   * Slot occupancy alone is not enough to decide who may write a phase. An
   * abandoned run keeps executing, and if it later resumes while a REPLACEMENT
   * run holds the slot, its phase writes would land on the replacement — so a
   * feed wedged in `read-latest-point` could be reported as wedged in
   * `apply:runOracleUpdate`. A wrong label is worse than the "unknown" it
   * replaced, and it would be wrong in exactly the multi-orphan scenario the
   * label exists to diagnose.
   */
  const owner: Record<string, object> = {}
  const lastRefusalLog: Record<string, number> = {}

  const totalAbandoned = () =>
    Object.values(outstandingAbandoned).reduce((a, b) => a + b, 0)

  /**
   * Start a feed's work without blocking the cron run, at most once at a time.
   *
   * Skipping while in-flight is what replaces croner's `protect` at feed
   * granularity: a source slower than its own poll period runs as often as it
   * can finish rather than piling up overlapping fetches.
   */
  const dispatch = (
    feedId: string,
    run: (ctx: {
      signal: AbortSignal
      /** Bound to THIS run; a write from a superseded run is dropped. */
      setPhase: (step: string) => void
    }) => Promise<void>
  ) => {
    if (inFlightSince[feedId] != null) return

    const feedOrphans = outstandingAbandoned[feedId] ?? 0
    if (
      feedOrphans >= opts.maxAbandonedPerFeed ||
      totalAbandoned() >= opts.maxAbandonedTotal
    ) {
      // Re-arming past this point adds another orphan every tick. The feed is
      // dark either way; say so loudly rather than quietly making the process
      // worse. Only a restart, or the orphans settling, clears this.
      refused[feedId] = true
      const now = Date.now()
      if (now - (lastRefusalLog[feedId] ?? 0) >= opts.refusalLogIntervalMs) {
        lastRefusalLog[feedId] = now
        opts.log.error(
          `[oracle-feeds] ${feedId}: refusing to poll — ${feedOrphans} abandoned run(s) on this feed and ${totalAbandoned()} in the process are still unsettled. This process needs a restart.`
        )
      }
      return
    }
    refused[feedId] = false

    const startedAt = Date.now()
    inFlightSince[feedId] = startedAt
    lastAttemptAt[feedId] = startedAt
    const token = {}
    owner[feedId] = token
    // Two conditions, not one. Identity stops a superseded run relabelling its
    // replacement; slot occupancy stops an abandoned run resurrecting a label
    // for a feed that currently has nothing running. Either alone leaves a way
    // to report a phase that is not where the feed actually is.
    const setPhase = (step: string) => {
      if (owner[feedId] === token && inFlightSince[feedId] != null)
        phase[feedId] = step
    }

    // A deadline that CANCELS rather than merely stops waiting. Racing a
    // promise frees the slot but leaves the work running, so a permanently
    // hung source would leak one orphan per poll forever — the same unbounded
    // accumulation this guard exists to prevent, only quieter. The signal
    // gives the work a real chance to unwind; the counter covers the case
    // where even that does not take.
    const controller = new AbortController()
    let abandoned = false

    const timer = setTimeout(() => {
      abandoned = true
      controller.abort()
      outstandingAbandoned[feedId] = (outstandingAbandoned[feedId] ?? 0) + 1
      opts.log.error(
        `[oracle-feeds] ${feedId}: run exceeded ${
          opts.deadlineMs
        }ms in phase "${
          phase[feedId] ?? 'unknown'
        }"; cancelled it and re-armed the feed (${
          outstandingAbandoned[feedId]
        } outstanding on this feed, ${totalAbandoned()} in the process)`
      )
      delete inFlightSince[feedId]
      delete phase[feedId]
    }, opts.deadlineMs)
    // Never hold the process open for a deadline on fire-and-forget work.
    timer.unref?.()

    void run({ signal: controller.signal, setPhase })
      .catch((err) =>
        opts.log.error(`[oracle-feeds] ${feedId}: unhandled — ${err}`)
      )
      .finally(() => {
        clearTimeout(timer)
        if (abandoned) {
          // It settled after all, so whatever it held is released. Give the
          // budget back rather than leaving the feed refusing runs forever.
          outstandingAbandoned[feedId] = Math.max(
            0,
            (outstandingAbandoned[feedId] ?? 1) - 1
          )
          opts.log(
            `[oracle-feeds] ${feedId}: a cancelled run settled late (${outstandingAbandoned[feedId]} still outstanding on this feed)`
          )
          return
        }
        lastSuccessAt[feedId] = Date.now()
        delete inFlightSince[feedId]
        delete phase[feedId]
      })
  }

  return {
    dispatch,
    totalAbandoned,
    phaseOf: (feedId: string) => phase[feedId],
    inFlightSince: (feedId: string) => inFlightSince[feedId],
    lastAttemptAt: (feedId: string) => lastAttemptAt[feedId],
    lastSuccessAt: (feedId: string) => lastSuccessAt[feedId],
    outstandingAbandoned: (feedId: string) => outstandingAbandoned[feedId] ?? 0,
    isRefused: (feedId: string) => refused[feedId] === true,
  }
}
