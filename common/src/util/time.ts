export const MINUTE_MS = 60 * 1000
export const HOUR_MS = 60 * MINUTE_MS
export const DAY_MS = 24 * HOUR_MS
export const WEEK_MS = 7 * DAY_MS
export const MONTH_MS = 30 * DAY_MS
export const YEAR_MS = 365 * DAY_MS
export const HOUR_SECONDS = 60 * 60

export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms))

export const isAprilFools = (): boolean => {
  const sf = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'numeric',
    day: 'numeric',
  })
  return sf === '4/1'
}
