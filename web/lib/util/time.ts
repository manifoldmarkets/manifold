import { DAY_MS, HOUR_MS } from 'common/util/time'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { Period } from '../firebase/users'
dayjs.extend(relativeTime)

export function fromNow(time: number) {
  return dayjs(time).fromNow()
}

const FORMATTER = new Intl.DateTimeFormat('default', {
  dateStyle: 'medium',
  timeStyle: 'medium',
})

export const formatTime = FORMATTER.format

export function formatTimeShort(time: number) {
  return dayjs(time).format('MMM D, h:mma')
}

export const periodDurations: {
  [period in Exclude<Period, 'allTime'>]: number
} = {
  daily: 1 * DAY_MS,
  weekly: 7 * DAY_MS,
  monthly: 30 * DAY_MS,
}

export const getCutoff = (period: Period) => {
  if (period === 'allTime') {
    return new Date(0).valueOf()
  }
  const nowRounded = Math.round(Date.now() / HOUR_MS) * HOUR_MS
  return nowRounded - periodDurations[period]
}
