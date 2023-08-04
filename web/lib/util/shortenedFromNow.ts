import dayjs from 'dayjs'
import duration from 'dayjs/plugin/duration'
import {} from 'dayjs/plugin/duration'

dayjs.extend(duration)

export function shortenedFromNow(time: number): string {
  const diff = dayjs.duration(Math.abs(dayjs().diff(time)))

  const units: { [key: string]: number } = {
    y: diff.years(),
    mo: diff.months(),
    d: diff.days(),
    h: diff.hours(),
    m: diff.minutes(),
    s: diff.seconds(),
  }

  for (const unit in units) {
    if (units[unit] > 0) {
      return `${units[unit]}${unit}`
    }
  }

  return '0s'
}
