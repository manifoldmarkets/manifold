// The Pacific streak day boundary — the "today" both widgets are defined against.
//
// NOTE it is NOT what the backend's reset job measures. reset-betting-streaks
// compares lastBetTime against ts_to_millis(now() - interval '1 day'), a rolling
// 24 hours from whenever the job runs. The two agree on the other 363 days and
// diverge by an hour on the two DST transitions, where a Pacific day is 23 or 25
// hours long. That makes predictOvernight (native/widgets/streak-widget.tsx)
// disagree with the backend for a narrow cohort on those two days: in spring it
// can predict a freeze the backend did not consume, in autumn it can stay pending
// when one was. The prediction performs no write and the next ordinary refresh
// corrects it, so this is left as a known, bounded divergence. A focused fix
// would compare against todayStart - 24h, with a test for each transition.
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
