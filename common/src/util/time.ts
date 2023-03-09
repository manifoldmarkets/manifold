export const MINUTE_MS = 60 * 1000
export const HOUR_MS = 60 * MINUTE_MS
export const DAY_MS = 24 * HOUR_MS
export const WEEK_MS = 7 * DAY_MS

export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms))
