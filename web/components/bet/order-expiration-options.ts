import { DAY_MS, HOUR_MS, MONTH_MS, WEEK_MS } from 'common/util/time'

export const EXPIRATION_OPTIONS = [
  { label: 'Never expires', value: 0 },
  { label: 'Expires immediately', value: 1 },
  { label: 'Expires in 1 hour', value: HOUR_MS },
  { label: 'Expires in 1 day', value: DAY_MS },
  { label: 'Expires in 1 week', value: WEEK_MS },
  { label: 'Expires in 1 month', value: MONTH_MS },
  { label: 'Custom time...', value: -1 },
]
