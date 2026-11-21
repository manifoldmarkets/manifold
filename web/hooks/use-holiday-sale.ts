import { useEffect, useState } from 'react'

import {
  getActiveHolidaySale,
  HOLIDAY_SALES,
  HolidaySale,
} from 'common/holiday-sale'
import { MINUTE_MS } from 'common/util/time'

// The Black Friday / Cyber Monday sale running now, if any. Undefined on the
// server render and first paint (no hydration mismatch on static pages), then
// kept current: it wakes at the next sale start or end, and at least once a
// minute, so an open tab switches right at midnight.
export function useActiveHolidaySale(): HolidaySale | undefined {
  const [now, setNow] = useState<number>()
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      const t = Date.now()
      setNow(t)
      const nextBoundary = Math.min(
        ...HOLIDAY_SALES.flatMap((s) => [s.startTime, s.endTime]).filter(
          (b) => b > t
        )
      )
      // +50ms so the wake lands just past the boundary, not just before it.
      const wait = Math.min(MINUTE_MS, nextBoundary - t + 50)
      timer = setTimeout(tick, Number.isFinite(wait) ? wait : MINUTE_MS)
    }
    tick()
    return () => clearTimeout(timer)
  }, [])
  return now === undefined ? undefined : getActiveHolidaySale(now)
}
