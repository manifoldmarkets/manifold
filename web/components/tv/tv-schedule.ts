import { MINUTE_MS } from 'common/util/time'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import { db } from 'web/lib/supabase/db'

export interface ScheduleItem {
  id: number
  creator_id: string
  source: string
  title: string
  stream_id: string
  contract_id: string
  start_time: string
  end_time: string
  is_featured: boolean
}

export const filterSchedule = (
  schedule: ScheduleItem[] | null,
  scheduleId: string | null
) => {
  return (schedule ?? [])
    .filter(
      (s) =>
        dayjs(s.end_time ?? '')
          .add(1, 'hour')
          .isAfter(dayjs()) || s.id.toString() === scheduleId
    )
    .sort((a, b) => dayjs(a.start_time).diff(dayjs(b.start_time)))
}

export const useTVSchedule = (
  defaultSchedule: ScheduleItem[] = [],
  defaultScheduleId: string | null = null
) => {
  const [schedule, setSchedule] = useState(defaultSchedule)

  const fetchSchedule = async () => {
    const { data } = await db.from('tv_schedule').select('*')
    const newSchedule = filterSchedule(data as any, defaultScheduleId)
    setSchedule(newSchedule)
  }

  useEffect(() => {
    fetchSchedule()
    const interval = setInterval(fetchSchedule, 1 * MINUTE_MS)
    return () => clearInterval(interval)
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
