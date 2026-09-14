import { DAY_MS, HOUR_MS } from 'common/util/time'
import { log } from 'shared/monitoring/log'

// Milliseconds from `now` until the UTC clock next reads hourUtc:00. An exact
// hit counts as the next day, so rescheduling from a tick's own target time
// always lands on the following day.
export const msUntilNextUtcHour = (hourUtc: number, now: number) => {
  const todayAtHour = now - (now % DAY_MS) + hourUtc * HOUR_MS
  return todayAtHour > now ? todayAtHour - now : todayAtHour + DAY_MS - now
}

// Run fn every day at hourUtc:00 UTC for the life of the process. Tomorrow's
// run is scheduled from today's intended time, before fn starts, so a late
// timer, a slow run, or a failed run can never skip or repeat a day.
export const scheduleDailyAtUtcHour = (
  hourUtc: number,
  name: string,
  fn: () => Promise<void>
) => {
  const scheduleAfter = (from: number) => {
    const target = from + msUntilNextUtcHour(hourUtc, from)
    const timer = setTimeout(() => {
      scheduleAfter(target)
      fn().catch((error) =>
        log.error(`${name} failed`, {
          error: error instanceof Error ? error.message : String(error),
        })
      )
    }, target - Date.now())
    // Never hold the process open on this timer alone.
    timer.unref?.()
  }
  scheduleAfter(Date.now())
}
