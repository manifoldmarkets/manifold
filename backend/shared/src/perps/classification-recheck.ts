import { DAY_MS } from 'common/util/time'

// Pure helpers for the re-check loops over classification rows — no database,
// no I/O — so the cooldown arithmetic that decides when a paid research call is
// spent can be tested without mocking anything.
//
// Shared by both queues (open-weight models, Chinese-lab publishers) and by
// both kinds of row that get re-examined: PENDING rows the research agent is
// working for a human, and PROVISIONAL rows that already carry a default
// verdict and are watched until a human firms it.

/**
 * How long a provisional verdict is left alone between re-checks.
 *
 * Longer than the pending-row cooldown by design. A pending row is a human's
 * queue item with a two-day clock to a feed halt, so it is retried several
 * times inside that window. A provisional row has a verdict and the index is
 * publishing on it; what would change it is a publisher shipping weights or a
 * stealth model being revealed, and those happen on a timescale of weeks. One
 * Haiku session per watched row per week is cents. Four a day, forever, for an
 * answer that cannot have changed is the pattern the pending cooldown exists
 * to prevent, and it would be worse here because nothing bounds how long a
 * row stays watched.
 */
export const PROVISIONAL_RECHECK_INTERVAL_MS = 7 * DAY_MS

/** Parse a timestamp from untrusted jsonb/text; NaN when it does not parse. */
export const parseTimestamp = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN
  if (typeof value !== 'string') return NaN
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : NaN
}

/** The latest parseable timestamp among several, or null if none parses. */
export const latestTimestamp = (values: readonly unknown[]): number | null => {
  let latest: number | null = null
  for (const value of values) {
    const parsed = parseTimestamp(value)
    if (!Number.isFinite(parsed)) continue
    if (latest === null || parsed > latest) latest = parsed
  }
  return latest
}

/**
 * Whether a row is due for another look.
 *
 * `checkedAt` is every timestamp that counts as "someone looked": the agent's
 * last run and, for a provisional row, the human verdict itself — the operator
 * read the research when they clicked, so the first re-check waits a full
 * interval rather than firing on the next sweep and re-asking a question that
 * was answered hours ago. A row with no parseable timestamp reads as never
 * checked, so a malformed value costs one extra call rather than hiding the
 * row forever.
 */
export const isDueForRecheck = (
  checkedAt: readonly unknown[],
  intervalMs: number,
  now: number
): boolean => {
  const latest = latestTimestamp(checkedAt)
  if (latest === null) return true
  return now - latest >= intervalMs
}

/**
 * Never-checked rows first, then longest since the last check, so a per-sweep
 * cap always spends its calls on the rows that have waited longest. Ties keep
 * input order, which the callers have already made deterministic.
 */
export const sortByLastChecked = <T>(
  rows: readonly T[],
  checkedAt: (row: T) => readonly unknown[]
): T[] =>
  rows
    .map((row, index) => ({ row, index, at: latestTimestamp(checkedAt(row)) }))
    .sort((a, b) => {
      if (a.at === null && b.at === null) return a.index - b.index
      if (a.at === null) return -1
      if (b.at === null) return 1
      return a.at - b.at || a.index - b.index
    })
    .map((entry) => entry.row)
