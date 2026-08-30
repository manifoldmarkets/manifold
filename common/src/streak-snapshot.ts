// The Pacific streak day boundary — the "today" the backend's streak logic and
// both widgets are defined against.
//
// It lives in common/ so CI can cover it, including the two DST days a year when
// a Pacific day is 23 or 25 hours long. The native package has no test runner,
// and the Android widget's midnight rollover depends on getting this right.

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
