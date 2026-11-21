import { DAY_MS, HOUR_MS } from '../util/time'
import { parseSportsKickoffMs } from '../sports-kickoff-interface'

// Modern civil offsets run from UTC−12 through UTC+14. A neutral-site game
// need not be played in its designated home team's zone.
const EARLIEST_OFFSET_MS = 14 * HOUR_MS
const LATEST_OFFSET_MS = 12 * HOUR_MS
export const BDL_MAX_DATE_ONLY_SPAN_MS =
  DAY_MS + EARLIEST_OFFSET_MS + LATEST_OFFSET_MS

/** Legacy date-only rows missing an upper bound get the conservative full day range. */
export function storedGameDayEnd(
  start: number,
  dateOnly: boolean | null,
  timestamp: string | null
) {
  if (!dateOnly) return start
  const latest = parseSportsKickoffMs(timestamp ?? undefined)
  return latest >= start && latest - start <= BDL_MAX_DATE_ONLY_SPAN_MS
    ? latest
    : start + BDL_MAX_DATE_ONLY_SPAN_MS
}

/** Inclusive range of instants which can fall on this provider civil date. */
export function bdlGameDayBounds(date: string, venueTimeZone?: string) {
  const midnight = parseSportsKickoffMs(date + 'T00:00:00Z')
  if (!Number.isFinite(midnight)) return null
  const start = midnight - EARLIEST_OFFSET_MS
  const until = midnight + DAY_MS + LATEST_OFFSET_MS
  if (venueTimeZone === undefined) return { start, latestStart: until - 1 }
  let format: Intl.DateTimeFormat
  try {
    format = new Intl.DateTimeFormat('en-CA', {
      timeZone: venueTimeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  } catch {
    return null
  }
  // Find local civil-day boundaries without assuming that a day lasts 24 h or
  // that a timezone transition always happens at 02:00.
  const boundary = (after: boolean) => {
    let low = start,
      high = until
    while (low < high) {
      const mid = low + Math.floor((high - low) / 2)
      const local = format.format(mid)
      if (after ? local > date : local >= date) high = mid
      else low = mid + 1
    }
    return low
  }
  const first = boundary(false),
    last = boundary(true) - 1
  return first <= last && format.format(first) === date
    ? { start: first, latestStart: last }
    : null
}
