import { User } from 'common/user'
import { useEffect, useState } from 'react'
import { DAY_MS } from 'common/util/time'
import { getUserEventsCount } from 'common/supabase/user-events'
import { db } from 'web/lib/supabase/db'
import dayjs from 'dayjs'

export const useHasSeen = (
  user: User | null | undefined,
  eventNames: string[],
  timePeriod: 'day' | 'week'
) => {
  const [seen, setSeen] = useState(true)
  useEffect(() => {
    if (!user) return
    let startMs = 0
    let endMs = 0
    if (timePeriod === 'day') {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      startMs = today.getTime()
      endMs = startMs + DAY_MS
    } else if (timePeriod === 'week') {
      startMs = dayjs().startOf('week').valueOf()
      endMs = startMs + DAY_MS * 7
    }
    getUserEventsCount(user.id, eventNames, startMs, endMs, db).then((count) =>
      setSeen(count > 0)
    )
  }, [user])

  return [seen, setSeen] as const
}
