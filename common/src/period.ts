import { DAY_MS, HOUR_MS } from './util/time'

export const PERIODS = ['1hour', '6hour', 'daily', 'weekly', 'monthly', 'allTime'] as const
export type Period = typeof PERIODS[number]

export const periodDurations: {
  [period in Exclude<Period, 'allTime'>]: number
} = {
  '1hour': 1 * HOUR_MS,
  '6hour': 6 * HOUR_MS,
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
