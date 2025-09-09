import { useApiSubscription } from 'client-common/hooks/use-api-subscription'
import { Row } from 'common/supabase/utils'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { db } from 'web/lib/supabase/db'

export type ScheduleItem = Row<'tv_schedule'>

export const useTVSchedule = (
  defaultSchedule: ScheduleItem[] = [],
  defaultScheduleId: string | null = null
) => {
  const [schedule, setSchedule] = usePersistentLocalState(
    defaultSchedule,
    'tv-schedule'
  )

  useEffect(() => {
    const fetchSchedule = async () => {
      const cutoff = dayjs().subtract(1, 'hour').toISOString()
      let query = db
        .from('tv_schedule')
        .select('*')
        .order('start_time', { ascending: true })

      if (defaultScheduleId) {
        query = query.or(`end_time.gt.${cutoff},id.eq.${defaultScheduleId}`)
      } else {
        query = query.gt('end_time', cutoff)
      }

      const { data } = await query
      setSchedule((data ?? []) as ScheduleItem[])
    }

    void fetchSchedule()
  }, [defaultScheduleId])

  useApiSubscription({
    topics: ['tv_schedule'],
    onBroadcast: async () => {
      const cutoff = dayjs().subtract(1, 'hour').toISOString()
      let query = db
        .from('tv_schedule')
        .select('*')
        .order('start_time', { ascending: true })

      if (defaultScheduleId) {
        query = query.or(`end_time.gt.${cutoff},id.eq.${defaultScheduleId}`)
      } else {
        query = query.gt('end_time', cutoff)
      }

      const { data } = await query
      if (data) setSchedule(data as ScheduleItem[])
    },
  })

  return schedule
}

export const useTVisActive = () => {
  const schedule = useTVSchedule()
  const activeStream = getActiveStream(schedule, null)
  return activeStream !== undefined
}

export const getActiveStream = (
  schedule: ScheduleItem[],
  scheduleId: string | null
) => {
  if (scheduleId) return schedule.find((s) => s.id.toString() === scheduleId)

  const featured = schedule.filter((s) => s.is_featured)

  const now = dayjs()
  const activeNow = featured.find(
    (s) => dayjs(s.start_time).isBefore(now) && dayjs(s.end_time).isAfter(now)
  )
  if (activeNow) return activeNow

  const soonest = featured
    .slice()
    .sort((a, b) => dayjs(a.start_time).diff(dayjs(b.start_time)))
  if (soonest.length > 0 && dayjs(soonest[0].start_time).diff(now, 'hour') < 1)
    return soonest[0]

  const justEnded = featured
    .slice()
    .sort((a, b) => dayjs(a.end_time).diff(dayjs(b.end_time)))
  if (
    justEnded.length > 0 &&
    dayjs(justEnded[0].end_time).diff(now, 'hour') < 1
  )
    return justEnded[0]

  return undefined
}

// Returns true if there exists a featured schedule item whose [start_time, end_time]
// intersects with the window [now - windowMinutes, now + windowMinutes].
export const hasFeaturedEventNearNow = (
  schedule: ScheduleItem[],
  windowMinutes = 10
) => {
  const now = dayjs()
  const windowStart = now.subtract(windowMinutes, 'minute')
  const windowEnd = now.add(windowMinutes, 'minute')
  return schedule.some((s) => {
    if (!s.is_featured) return false
    const start = dayjs(s.start_time)
    const end = dayjs(s.end_time ?? s.start_time)
    // Intersect if start <= windowEnd AND end >= windowStart
    return !start.isAfter(windowEnd) && !end.isBefore(windowStart)
  })
}

// Hook that updates on a timer so the value flips without a broadcast.
export const useTVIsLive = (windowMinutes = 10) => {
  const schedule = useTVSchedule()
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  // recompute on each render triggered by schedule updates or tick
  void tick
  return hasFeaturedEventNearNow(schedule, windowMinutes)
}
