import { HOUR_MS } from './util/time'

/**
 * Prediction streaks run on Pacific calendar days, for every user, wherever
 * they actually are. The bonus that extends a streak and the nightly job that
 * ends one must agree on exactly where that boundary sits, so both derive it
 * from here.
 */
export const STREAK_TIMEZONE = 'America/Los_Angeles'

// dayjs is deliberately avoided in this file: common/src is type-checked both
// by web (esModuleInterop on) and by common/backend (off), and no single dayjs
// import style satisfies both. Intl is built in and needs no import.
const wallClockFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: STREAK_TIMEZONE,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

type WallClock = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

const getWallClock = (ts: number): WallClock => {
  const parts = Object.fromEntries(
    wallClockFormatter
      .formatToParts(new Date(ts))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)])
  ) as WallClock
  // Some ICU builds render midnight as hour 24 under `hour12: false`.
  return { ...parts, hour: parts.hour % 24 }
}

/** How far Pacific wall-clock time runs ahead of UTC at the instant `ts`. */
const getOffsetMs = (ts: number) => {
  const { year, month, day, hour, minute, second } = getWallClock(ts)
  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute, second)
  return wallClockAsUtc - Math.floor(ts / 1000) * 1000
}

/** Epoch ms of the Pacific midnight that opens the streak day holding `at`. */
export const getStreakDayStart = (at: number = Date.now()) => {
  const { year, month, day } = getWallClock(at)
  const midnightAsUtc = Date.UTC(year, month - 1, day)
  // Convert those wall-clock fields back into a real instant. US daylight
  // saving shifts at 2 AM local, so local midnight is never skipped or
  // repeated and re-reading the offset at the approximation converges here.
  const approximate = midnightAsUtc - getOffsetMs(at)
  return midnightAsUtc - getOffsetMs(approximate)
}

/** Epoch ms of the next Pacific midnight: the exclusive end of `at`'s day. */
export const getStreakDayEnd = (at: number = Date.now()) =>
  // Stepping 36h past midnight lands inside the following day whether it runs
  // 23, 24 or 25 hours, so this holds across both DST transitions.
  getStreakDayStart(getStreakDayStart(at) + 36 * HOUR_MS)

/**
 * The `[start, end)` streak day the nightly reset job should judge when it
 * runs at `at` — the day that just closed. This depends only on the calendar,
 * never on when the job actually fired, so a late run reaches the same verdict
 * as a punctual one.
 */
export const getStreakDayToJudge = (at: number = Date.now()) => {
  const end = getStreakDayStart(at)
  // Half a day back from midnight is always comfortably inside yesterday.
  return { start: getStreakDayStart(end - 12 * HOUR_MS), end }
}
