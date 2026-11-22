// Age immutable provider receipts against the origin clock and CDN residence time.
export function createSportsViewClock(elapsed = () => performance.now()) {
  let anchor: { at: number; elapsed: number } | undefined
  function now() {
    return anchor
      ? anchor.at + Math.max(0, elapsed() - anchor.elapsed)
      : Date.now()
  }
  function observe(
    snapshot: number | undefined,
    date: string | null,
    age: string | null
  ) {
    if (snapshot == null || !Number.isSafeInteger(snapshot) || snapshot <= 0)
      return
    const dateMs = Date.parse(date ?? '')
    const ageMs = age != null && /^\d+$/.test(age) ? Number(age) * 1000 : 0
    const at =
      Math.max(snapshot, Number.isFinite(dateMs) ? dateMs : 0) +
      (Number.isSafeInteger(ageMs) ? ageMs : 0)
    if (!anchor || at > now()) anchor = { at, elapsed: elapsed() }
  }
  function observeReceipt(at: number) {
    if (!anchor || !Number.isSafeInteger(at) || at <= 0 || at > now() + 30_000)
      return false
    if (at > now()) anchor = { at, elapsed: elapsed() }
    return true
  }
  return { now, observe, observeReceipt }
}
const clock = createSportsViewClock()
export const sportsViewNow = clock.now
export const observeSportsClock = clock.observe

export const observeSportsReceipt = clock.observeReceipt

/** A render can finish just before expiry and its effect can run just after. */
export function sportsTimerDelay(
  deadlines: number[],
  renderedAt: number,
  now: number
) {
  const next = deadlines.reduce(
    (first, at) => (at > renderedAt && at < first ? at : first),
    Infinity
  )
  return Number.isFinite(next)
    ? Math.min(2147483647, Math.max(0, next - now))
    : undefined
}
