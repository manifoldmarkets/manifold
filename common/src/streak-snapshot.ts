// The Pacific streak day, and the rule for when a freshly-fetched streak row may
// be accepted as authoritative for it.
//
// Both the widget's headless task and the app re-fetch the user's streak and
// persist it. Around the streak rollover that is a race with the backend's own
// midnight job: the API can still answer with the day-that-just-ended's row, and
// persisting it stamps pre-reset data with a post-midnight `updatedAt`. That is
// worse than showing something stale, because the fresh timestamp then closes the
// widget's staleness gate (no further fetch that day) AND disqualifies its local
// overnight prediction, which only replays a reset for a snapshot synced during
// the day that just ended. The widget would show an unconsumed freeze, or a
// streak that has actually died, until the app is next opened.
//
// So acceptance is evidence-based rather than time-based: a row is authoritative
// only once it PROVES the reset has been applied to it. A fixed grace period
// would be guesswork, since nothing bounds when the backend job completes.
//
// This lives in common/ so CI can test it — the native package has no test
// runner, and this is the invariant the whole rollover path depends on.

/** How many ms past LA-midnight the LA wall clock reads at `at`. */
export function laWallClockMsPastMidnight(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(at)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  // '24' can appear for midnight in some engines; normalize to 0.
  const h = get('hour') % 24
  const m = get('minute')
  const s = get('second')
  return ((h * 60 + m) * 60 + s) * 1000 + at.getMilliseconds()
}

/**
 * Most recent midnight America/Los_Angeles, in epoch ms (the streak "today"
 * boundary the backend uses). First pass: subtract however many ms `now` is past
 * LA-midnight in wall-clock terms. On the two DST-transition days wall-clock ms
 * != elapsed ms, so that candidate lands +/-1h off — the second pass reads the LA
 * wall clock AT the candidate and nudges it home (exactly 0, a no-op, on the
 * other 363 days). Mirrors pacificStartOfDay() in index.swift, which gets DST
 * handling from Calendar for free.
 */
export function pacificStartOfDayMs(now: Date): number {
  let start = now.getTime() - laWallClockMsPastMidnight(now)
  const drift = laWallClockMsPastMidnight(new Date(start))
  if (drift !== 0) {
    const halfDay = 12 * 60 * 60 * 1000
    start += drift > halfDay ? 24 * 60 * 60 * 1000 - drift : -drift
  }
  return start
}

/** The streak fields the reset rule reads. */
export type StreakResetFacts = {
  streak: number
  lastBetTime: number
  lastStreakFreezeTime: number
}

/**
 * May this freshly-fetched row be persisted as authoritative for the current
 * Pacific day?
 *
 * True when the row carries positive evidence that the midnight job has already
 * been applied to it — or that there was nothing for that job to do:
 *
 *  - no live streak, so no reset was ever due;
 *  - a bet TODAY, which no run of the job today can undo;
 *  - a freeze consumed today, which only the reset does.
 *
 * The bet test deliberately uses today's start, not the previous day's. The
 * backend predicate is `lastBetTime < ts_to_millis(now() - interval '1 day')`
 * (backend/scheduler/src/jobs/reset-betting-streaks.ts) - a ROLLING 24 hours
 * measured when the job happens to run, not the Pacific day. A bet at 00:00:05
 * yesterday clears a "did they bet yesterday" test, yet a job running at 00:00:10
 * today still resets it. `now()` is also evaluated separately in that job's SELECT
 * and UPDATE, and on a DST day a Pacific day is 23h or 25h rather than 24h, so
 * the two cutoffs can differ by an hour. A bet at or after today's start is the
 * only bet-based proof that holds for every execution time today.
 *
 * The cost is that a user who bet yesterday but not yet today has no accepted
 * row until they bet again, so the widget keeps rendering its stored snapshot.
 * That snapshot is correct for them (it still derives 'pending'), and the fetch
 * simply retries - the conservative direction is the safe one here.
 *
 * False for the shape that means "the job has not reached this row yet": a live
 * streak, no bet today, and no freeze consumed today.
 * Callers must then keep the older snapshot — stale timestamp included — so the
 * local prediction still runs and the next fetch retries. This self-heals: it
 * keeps refusing only for as long as the backend keeps answering with pre-reset
 * data, and accepts the moment the row changes.
 */
export function reflectsDailyReset(
  row: StreakResetFacts | null | undefined,
  now: Date
): boolean {
  if (!hasSaneStreakFields(row)) return false
  const todayStart = pacificStartOfDayMs(now)

  if (!(row.streak > 0)) return true
  if (row.lastBetTime >= todayStart) return true
  if (row.lastStreakFreezeTime >= todayStart) return true
  return false
}

/**
 * Are these fields numbers we can reason about at all? A payload reaches the
 * widget from the web client as well as from our own fetch, and a NaN or an
 * Infinity would silently defeat every comparison above (NaN >= x is false, so a
 * garbage row would look like the pre-reset shape forever). Reject rather than
 * guess.
 */
export function hasSaneStreakFields(
  row: StreakResetFacts | null | undefined
): row is StreakResetFacts {
  if (!row) return false
  return (
    Number.isFinite(row.streak) &&
    Number.isFinite(row.lastBetTime) &&
    Number.isFinite(row.lastStreakFreezeTime) &&
    row.lastBetTime >= 0 &&
    row.lastStreakFreezeTime >= 0
  )
}

/**
 * The single question every writer must ask before persisting a streak snapshot:
 * are the fields sane, and does the row prove the day's reset has been applied?
 */
export function mayPersistStreakSnapshot(
  row: StreakResetFacts | null | undefined,
  now: Date
): boolean {
  return hasSaneStreakFields(row) && reflectsDailyReset(row, now)
}
